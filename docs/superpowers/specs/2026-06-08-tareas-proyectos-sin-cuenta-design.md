# Diseño — Tareas: Proyectos sin cuenta + Tareas sueltas

**Fecha:** 2026-06-08
**Estado:** aprobado (brainstorm), pendiente plan de implementación
**Contexto:** cierra el item #7 del feedback original del módulo de Tareas (ver `2026-06-04-modulo-tareas-kanban-design.md` y `2026-06-04-modulo-tareas-specA-enriquecer-tablero-design.md`). El módulo de Tareas (Kanban) está completo (Fases 1-7 + Spec A1-A5); lo único pendiente eran las tareas que no cuelgan de una cuenta.

## Objetivo

Hoy una tarea pertenece **sí o sí** a una cuenta (`tasks.accountId` es `notNull`). Este trabajo introduce dos contenedores nuevos para tareas que no son de un cliente, reusando todo el Kanban ya construido (board, drawer, comentarios, @menciones, etiquetas, subtareas, adjuntos, filtros):

1. **Proyecto interno** (con nombre): contenedor con su propio Kanban (ej. "Rediseño del sitio", "Onboarding empleado"). Las tareas cuelgan del proyecto.
2. **Tarea suelta**: tarea que no pertenece a ninguna cuenta ni proyecto. Vive a nivel workspace, en un board personal.

### Enfoque elegido (de 3 evaluados)

**A — Generalizar el "contenedor" del tablero.** Una tarea pertenece a **una cuenta, O un proyecto, O nada (suelta)**. El Kanban se reusa contra cualquiera de los tres scopes.

Descartadas:
- **B — Proyectos como "cuentas internas" (flag en `accounts`):** contamina la tabla de clientes, rompe el modelo de visibilidad (cuentas = owner/admin-ven-todo, lo contrario de "privado es privado"), arrastra finance/meta/CRM/share-links.
- **C — Módulo separado con tablas propias:** duplicaría comentarios, @menciones, etiquetas, subtareas, adjuntos y todo el drawer.

## Modelo de visibilidad (decisiones del brainstorm)

- **Proyecto interno:** privado del creador + miembros que él agregue. **Sin bypass de admin** — ni owner/admin lo ven si no fueron agregados. "Privado es privado".
- **Tarea suelta:** la ven el **creador** + el **responsable** (`assigneeId`). Para colaborar de a varios, se mueve la tarea a un proyecto. (No hay lista de "compartida con" por tarea suelta — se decidió la opción simple vía assignee.)
- **Cuentas:** el modelo existente queda **intacto** (owner/admin ven todo; resto ve cuentas propias o donde es consultor).

## Modelo de datos

### `tasks` (cambios)
- `accountId` → pasa a **nullable** (hoy `notNull`). Ensanchar es seguro: las filas actuales conservan su cuenta.
- nueva columna `projectId uuid` nullable, FK → `task_projects.id` `onDelete: cascade`.
- `workspaceId` sigue `notNull` (toda tarea vive en un workspace).
- índice nuevo: `tasks_project_idx` on `project_id`.

**Regla de negocio (enforced en app, sin CHECK en DB** — patrón ya usado en el módulo para no romper la base compartida**):**
- tarea de cuenta → `accountId` set, `projectId` null
- tarea de proyecto → `projectId` set, `accountId` null
- tarea suelta → ambos null

### `task_projects` (tabla nueva)
- `id uuid pk default random`
- `workspaceId uuid notNull` FK → workspaces, cascade
- `name text notNull`
- `description text` (nullable)
- `color text` (nullable; paleta reusable de `lib/tareas/labels.ts`)
- `createdBy uuid` FK → users, set null
- `archivedAt timestamp` (nullable; archivar sin borrar)
- `createdAt`, `updatedAt`
- índice: `task_projects_workspace_idx` on `workspace_id`

### `task_project_members` (tabla nueva)
- `projectId uuid` FK → task_projects, cascade
- `userId uuid` FK → users, cascade
- `createdAt`
- PK compuesta `(projectId, userId)`
- Al crear el proyecto se inserta automáticamente la fila del **creador**.

### Migración
- Nueva migración (próximo número, ~`0039`) **+ su `down.sql`** antes de `db:migrate` (workflow obligatorio del proyecto).
- Aplicar en la Supabase compartida (dev y prod comparten una sola base; `db:migrate` ya cubre prod).

## Acceso y visibilidad (código)

Extender `lib/queries/task-access.ts` con helpers paralelos a los de cuentas (no se tocan los existentes):

**Proyectos:**
- `getAccessibleProjectIds(userId, workspaceId)` → proyectos donde el usuario es miembro (`task_project_members`). Sin bypass de admin. Excluye archivados por defecto.
- `canAccessProject(userId, workspaceId, projectId)` → guard puntual para las actions.

**Tareas sueltas:**
- Sin tabla de acceso. Filtro directo en la query: `accountId IS NULL AND projectId IS NULL AND (createdBy = userId OR assigneeId = userId)`.
- `canAccessLooseTask(userId, task)` → `task.createdBy === userId || task.assigneeId === userId`. Para crear una suelta basta estar logueado (queda como `createdBy`).

**Membresía de proyecto:**
- Actions `addProjectMember` / `removeProjectMember`. Cualquier miembro puede agregar/quitar; el **creador no se puede quitar**.

## Actions y queries

### Scope discriminado

```ts
type TaskScope =
  | { kind: "account"; accountId: string }
  | { kind: "project"; projectId: string }
  | { kind: "loose" }
```

- Helper `assertScopeAccess(userId, workspaceId, scope)` enruta al guard correcto (`canAccessAccountTasks` / `canAccessProject` / loose).
- `createKanbanTask` recibe el scope y setea `accountId`/`projectId` según corresponda. En `loose` el creador queda como `createdBy`.
- `moveTask`, `updateTaskFields`, `deleteTask`, comentarios, adjuntos, etiquetas, subtareas: validan acceso vía la **tarea ya guardada** (derivan el scope de su `accountId`/`projectId`), así no hay que pasar el scope en cada call — minimiza cambios en board/drawer.

### Mover entre mundos
- En el drawer, campo **Contenedor**: reasignar la tarea entre cuenta ↔ proyecto ↔ suelta, solo hacia un destino al que el usuario tiene acceso. Cubre "esto en realidad va al proyecto X" y "ya es cliente, paso esto a la cuenta".

### Queries nuevas en `lib/queries/tareas.ts`
Reusan el mismo `select` + el mapeo a `KanbanTask`; solo cambia el `where`:
- `getProjectKanbanTasks(projectId)` — análoga a `getAccountKanbanTasks`.
- `getLooseKanbanTasks(userId)` — con el filtro de sueltas.
- `listWorkspaceTaskLabels(workspaceId)` — resuelve etiquetas por `workspaceId` directo (mismo pool reusable), en vez de cuenta→workspace.

### Vista global (decisión: todo junto)
- Generalizar `getGlobalTasks` y `components/tareas/global-tasks-view.tsx` para incluir **cuentas + proyectos + sueltas accesibles**, con **etiqueta de contenedor** por tarjeta/fila y **filtro por contenedor**.
- Respeta privacidad: solo muestra cuentas accesibles + proyectos donde el user es miembro + sus sueltas.

## UI y rutas

Reusan `kanban-board` + drawer completos.

### Rutas nuevas
- `/app/tareas/proyecto/[projectId]` — board del proyecto. Header con nombre + color editables, botón **Miembros** (popover para agregar/quitar miembros del workspace), botón **Archivar**, borrar (solo creador, con confirmación).
- `/app/tareas/mias` — board personal de tareas sueltas (creador + asignadas a mí).

### Índice `/app/tareas` reorganizado
Hoy es solo el board global. Se agrega arriba una fila de accesos; el board global (ahora mezclado) queda debajo:
- **"Mis tareas"** → card con contador, linkea a `/app/tareas/mias`.
- **"Proyectos"** → grid de cards (nombre, color, nº tareas) de *mis* proyectos + card **＋ Nuevo proyecto** (dialog: nombre, color, descripción; creador queda como miembro).
- **"Cuentas" / board global** → debajo, ahora con cuentas + proyectos + sueltas y filtro de contenedor.

### Crear/mover
- En cada board, "＋ Nueva tarea" crea ya con el contenedor correcto.
- Campo "Contenedor" en el drawer para mover (ver arriba).

### Sidebar
- El ítem "Tareas" sigue apuntando a `/app/tareas`. **No se agregan ítems nuevos** — los proyectos se alcanzan desde el índice.

## Casos borde

- **Extracción de meets (Fase 3):** sin cambios — sigue creando tareas **de cuenta**. Proyectos y sueltas son siempre manuales.
- **Vista pública de cliente:** sin cambios — por cuenta, filtra por `accountId`. Proyectos/sueltas son internos, **nunca** se exponen en links públicos.
- **Etiquetas:** mismo pool por workspace; se resuelve por `workspaceId` directo.
- **Notificaciones:** reuso lo existente — `assignment` al asignar una tarea de proyecto/suelta; `mention` en comentarios. Sin cambios de schema.
- **Subtareas:** heredan el contenedor del padre (el board agrupa por `parentTaskId IS NULL`).
- **Archivar proyecto:** `archivedAt`; oculta del índice y de los selectores de "Contenedor", no borra tareas.
- **Borrar proyecto:** cascade a sus tareas; solo el creador, con confirmación.
- **Borrado de cuenta:** una tarea de cuenta sigue con cascade; sin cambios.

## Verificación

- `npm run type-check` + `npm run build` como compuerta real (no `lint`; ver `reference_tooling_quirks`).
- Migración con su `down.sql`, aplicada en la Supabase compartida.
- Checklist manual:
  - crear proyecto, agregar/quitar miembro, que un no-miembro (incl. admin) NO lo vea
  - crear tarea suelta y verla solo creador + assignee
  - mover tarea entre los 3 mundos (cuenta ↔ proyecto ↔ suelta)
  - board global mezclado con filtro de contenedor
  - archivar proyecto (desaparece del índice/selector, tareas intactas)

## Fuera de alcance (YAGNI)

- Lista de "compartida con" por tarea suelta (se resolvió vía assignee).
- Roles dentro de un proyecto (todos los miembros son iguales).
- Exposición pública de proyectos/sueltas.
- Extracción automática de tareas de proyecto/sueltas desde meets.
