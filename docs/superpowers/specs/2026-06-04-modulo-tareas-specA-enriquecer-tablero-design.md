# Módulo de Tareas — Spec A: Enriquecer el tablero

**Fecha:** 2026-06-04
**Estado:** Aprobado para implementación
**Contexto:** mejoras sobre el Kanban entregado en Fase 2 (`b6120b8`). Surge de 7 ítems de feedback del usuario; el #7 (proyectos sin cuenta) se separa en su propio spec posterior.

## Resumen

Seis mejoras sobre el tablero Kanban por cuenta:
1. **UI optimista** — eliminar el patrón "editar → `router.refresh()` → esperar" y el bug del toggle "Visible para el cliente" (que no reflejaba el cambio hasta cerrar/reabrir).
2. **Título + descripción** — la tarjeta muestra solo el título; la descripción larga vive en el drawer.
3. **Subtareas = tareas reales anidadas** — checklist dentro del drawer del padre; cada subtarea es una tarea completa.
4. **Etiquetas con color** reutilizables a nivel workspace.
5. **Filtros + búsqueda** en el tablero.
6. **Drawer más ancho.**

## Decisiones tomadas (brainstorming)

- Spec A = ítems 1-6. El #7 (proyectos sin cuenta) va en spec aparte.
- Etiquetas: catálogo **reutilizable a nivel workspace**.
- Subtareas: **son tareas reales** (auto-referencia `parentTaskId`), no un modelo aparte.
- UI optimista con el **tablero como única fuente de verdad** (no `useOptimistic` puro, no estado por-componente).

## 1. UI optimista (item 1 + el "refrescar para ver")

### Problema

Hoy cada edición en el drawer/tablero llama a la server action y luego `router.refresh()` (round-trip RSC completo). Además el drawer dibuja desde una **foto fija** (`selected` snapshot en el board): tras el refresh, el board re-deriva sus columnas pero el objeto `selected` que alimenta el drawer sigue siendo el viejo, así que el cambio (ej. `isPublic`) no se ve hasta cerrar y reabrir. Resultado: lag + "pienso pero no cambia nada".

### Solución

- **El tablero (`KanbanBoard`) es la única fuente de verdad** del estado de las tareas en memoria (`cols`).
- El drawer deja de recibir una foto fija: recibe el `taskId` seleccionado y **deriva la tarea viva** del estado del board por id. Cualquier cambio se refleja al instante.
- Cada mutación (mover, toggle público, prioridad, fecha, responsable, título, descripción, etiquetas, subtareas) sigue este patrón **optimista**:
  1. Actualiza el estado local del board inmediatamente.
  2. Dispara la server action en background (sin `await` bloqueante de UI).
  3. Si la action devuelve `{ error }` o lanza: revierte el estado local y muestra el banner de error existente.
- **Se elimina `router.refresh()` de las ediciones.** Se mantiene solo donde haga falta re-sincronizar con el server (ej. al montar, o tras crear una subtarea que necesita el id real del server — ver más abajo).
- Las server actions ya devuelven `{ error?: string }` y son idempotentes; no cambian su firma.

### Manejo de ids en altas optimistas

Crear una tarea/subtarea necesita el `id` real del server (para ediciones siguientes). Patrón: la action `createKanbanTask` (y la nueva de subtareas) **devuelve el id creado** (`{ id?: string; error?: string }`); el board inserta una tarjeta temporal optimista y al resolver reemplaza el id temporal por el real. Si falla, la quita y muestra error.

### Arquitectura de componentes

- `KanbanBoard` mantiene `tasks` (lista plana viva) y deriva `cols` por columna. Expone handlers (`updateTask`, `moveTask`, `createTask`, `deleteTask`, `setLabels`, subtask handlers) que hacen optimista + server.
- `TaskDrawer` recibe `taskId | null` + los handlers del board + datos auxiliares (members, labels catalog). Deriva su tarea de la lista viva.
- Esto evita el snapshot stale y unifica el estado.

## 2. Título + descripción (item 2)

- **`tasks.title`** `text` nullable (aditivo).
- La **tarjeta muestra solo el título**, con fallback `title || description` para tareas viejas sin título (no quedan en blanco).
- El **drawer** muestra: campo "Título" (corto, una línea) + campo "Descripción" (largo, textarea). Ambos optimistas.
- Altas nuevas: título requerido; descripción opcional. El form inline de alta por columna pasa a pedir **título** (la descripción se completa luego en el drawer).
- La extracción de meets (`extract-tasks.ts`) seguirá poblando `description` (Fase 3 decide si además setea `title`); con el fallback `title || description` las tarjetas automáticas se ven bien igual.

## 3. Subtareas = tareas reales anidadas (item 3)

- **`tasks.parentTaskId`** `uuid` nullable, auto-referencia `references(() => tasks.id, { onDelete: "cascade" })` (aditivo). Borrar el padre borra sus subtareas.
- Una subtarea es una tarea completa (título, descripción, responsable, fecha, prioridad, etiquetas, su propio drawer).
- **El tablero top-level filtra `parentTaskId IS NULL`** — las subtareas NO aparecen como tarjetas sueltas.
- En el **drawer del padre**, sección "Subtareas": lista tipo checklist. Cada fila: tilde (hecho = subtarea en columna `listas`; togglear mueve entre `backlog`↔`listas`), título, responsable (avatar). Botón "+ Subtarea" (alta rápida con solo título → crea tarea hija con `parentTaskId`, columna `backlog`, mismo `accountId`).
- Click en una subtarea **abre su propio drawer** (anidado / reemplaza el contenido) para edición completa, con forma de volver al padre.
- La **tarjeta del padre** muestra progreso `✓ {hechas}/{total}` si tiene subtareas.
- Query: el board trae, por tarea top-level, el conteo de subtareas y cuántas están en `listas`. El drawer del padre trae la lista de subtareas (vía `getSubtasks(parentId)`).

## 4. Etiquetas con color reutilizables (item 4)

- **`task_labels`**: `id`, `workspaceId` (FK cascade), `name` (text), `color` (text — una key de una paleta fija), `createdAt`. Catálogo reutilizable del workspace.
- **`task_label_assignments`**: `id`, `taskId` (FK cascade), `labelId` (FK cascade), `createdAt`. Único por (taskId, labelId). Varias etiquetas por tarea.
- **Paleta fija** (~10 colores) definida client-side en `lib/tareas/labels.ts`: cada color es una key (`slate`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `indigo`, `purple`, `pink`) mapeada a clases Tailwind de chip (bg + text). Se valida la key al crear.
- **UI**: en el drawer, sección "Etiquetas" con los chips asignados + un selector para asignar de las existentes o **crear una nueva** (nombre + color de la paleta). En la **tarjeta**, los chips de color (compactos) arriba del título.
- **Actions**: `createLabel(workspaceId, name, color)`, `assignLabel(taskId, accountId, labelId)`, `unassignLabel(taskId, accountId, labelId)`. Acceso: las de asignación validan `canAccessAccountTasks`; crear etiqueta valida que el usuario pertenece al workspace.
- **Query**: el board trae las etiquetas asignadas por tarea (join). La página trae el catálogo del workspace (`listWorkspaceLabels`).

## 5. Filtros + búsqueda (item 5)

- Barra arriba del tablero (client-side, el volumen por tablero es chico):
  - **Búsqueda** por texto sobre título + descripción.
  - **Filtros**: responsable (incl. "sin asignar"), etiqueta, prioridad, vencimiento (vencidas / próximas 7 días / sin fecha), y "solo públicas".
- Filtra las tarjetas mostradas en cada columna sin tocar el server. Las columnas vacías por el filtro se muestran igualmente (con su header) para no romper el layout ni el drag.
- Botón "Limpiar filtros".

## 6. Drawer más ancho (item 6)

- Panel `w-full max-w-md` → **`w-full sm:max-w-2xl`** (de ~28rem a ~42rem). Más aire. Ajustable si se quiere más.

## Cambios de datos (todo aditivo, sin romper — base compartida dev/prod)

- `tasks`: **+ `title`** (text, null), **+ `parentTaskId`** (uuid, null, self-FK cascade).
- Nuevas tablas: **`task_labels`**, **`task_label_assignments`**.
- Migración Drizzle aditiva con su `down.sql`. NO backfill obligatorio (read-time fallback `title || description`). Sin CHECK constraints nuevos (consistente con el resto).

## Verificación

`npm run type-check` + `npm run build` (no hay test runner; `lint` cae en wizard interactivo). Verificación funcional manual del usuario en el deploy (especialmente la UI optimista y el drag&drop, que no se prueban headless).

## Fuera de alcance

- **Proyectos sin cuenta (item 7)** → spec propio posterior.
- Comentarios / @menciones / notificaciones → Fase 4/5 ya planificadas.
- Dedup de extracción → Fase 3.
- Kanban público → Fase 7. (Las subtareas y etiquetas en la vista pública se evalúan en Fase 7; por ahora la vista pública sigue como está.)
