# Módulo de Tareas (Kanban / gestión de proyectos) — Diseño

**Fecha:** 2026-06-04
**Estado:** Aprobado para implementación
**Autor:** brainstorming con el usuario

## Resumen

Convertir el panel de tareas (hoy embebido en el detalle de la cuenta) en un
módulo de gestión de proyectos de primer nivel, al estilo de Finanzas: con
vista por cliente y vista global, tablero Kanban de 6 columnas, dedup
inteligente de tareas extraídas de meets, colaboración (comentarios,
@menciones, centro de notificaciones), adjuntos por link de Drive, fechas de
entrega, control de acceso por cuenta, y un toggle por tarea para exponerla (o
no) en el enlace público al cliente.

## Decisiones tomadas (brainstorming)

1. **Acceso:** owner de la cuenta + consultores (`account_consultants`) +
   owners/admins del workspace ven todo. El resto no ve esa cuenta.
2. **Público:** privadas por defecto; tilde por tarea para marcarla pública.
   Las tareas existentes pasan a privadas.
3. **Dedup:** semántico (LLM) contra todas las tareas de la cuenta + contador
   "mencionada N veces". No duplica; registra cada mención.
4. **Vista global:** toggle Tablero ⇄ Lista, filtrable.
5. **Menciones:** centro de notificaciones in-app (campanita en el header).
6. **Detalle de cuenta (interno):** Kanban completo. **Público:** Kanban solo
   con tareas públicas y solo columnas que tengan ≥1 pública.
7. **Auto-completar:** la detección de "terminado en la meet" mueve la tarjeta
   a `listas`.

## Arquitectura

**Extender la tabla `tasks` existente, no crear una nueva.** `tasks` ya está
cableada a la extracción de meets, al share público y al historial. Se extiende
y se reutiliza para no re-cablear ni migrar datos.

### Columnas (nuevo `status`)

El campo `status` deja de ser `pending`/`completed` y pasa a ser la columna:

| key | Columna |
|-----|---------|
| `auto` | Automáticas de Meets |
| `backlog` | Backlog |
| `evaluacion` | Evaluación |
| `en_proceso` | En proceso |
| `por_aprobar` | Por Aprobar |
| `listas` | Listas |

## Modelo de datos

### Cambios a `tasks`

- `status` → una de las 6 keys, con `check` constraint.
- **+ `isPublic`** `boolean` not null default `false`.
- **+ `dueDate`** `date` nullable.
- **+ `sortOrder`** `integer` not null default `0` (orden dentro de la columna).
- Se mantienen: `priority`, `assigneeId`, `transcriptId`, `sourceExcerpt`,
  `sourceContext`, `completedAt` (se setea al pasar a `listas`).

### Tablas nuevas

- **`task_meeting_mentions`**: `id`, `taskId` (FK→tasks, cascade), `transcriptId`
  (FK→transcripts, set null), `sourceExcerpt`, `sourceContext`, `createdAt`.
  Provenance + contador "mencionada N veces". Índice por `taskId`.
- **`task_comments`**: `id`, `taskId` (FK cascade), `workspaceId`, `authorId`
  (FK→users set null), `body` text, `createdAt`, `updatedAt`. Índice por `taskId`.
- **`task_comment_mentions`**: `id`, `commentId` (FK cascade), `mentionedUserId`
  (FK→users cascade). Alimenta las notificaciones.
- **`task_attachments`**: `id`, `taskId` (FK cascade), `label`, `url`,
  `createdBy` (FK→users set null), `createdAt`. Links de Drive, sin archivo.
- **`notifications`**: `id`, `workspaceId`, `userId` (destinatario, FK cascade),
  `type` (`'mention'` | `'assignment'`), `taskId` (FK set null), `accountId`
  (FK set null), `actorId` (quién la generó), `commentId` (FK set null), `body`,
  `isRead` boolean default false, `createdAt`. Índice por (`userId`, `isRead`).

## Control de acceso

Helper `getTaskAccessibleAccountIds(userId, workspace)`:

- workspace **owner/admin** ⇒ todas las cuentas del workspace.
- resto ⇒ cuentas donde `account.ownerId === userId` **o** existe fila en
  `account_consultants` para (`accountId`, `userId`).

Se aplica en: módulo global, vista por cuenta y **cada Server Action** (no solo
en el front). Las acciones validan que el `accountId` de la tarea esté dentro de
los accesibles antes de mutar.

## Extracción de meets con dedup

Modificar `trigger/tasks/extract-tasks.ts`. Flujo nuevo:

1. La IA extrae tareas candidatas de la meet (descripción, prioridad, excerpt,
   contexto) — igual que hoy.
2. Traer las tareas existentes de la cuenta (id + descripción + columna),
   acotado a las activas/no-`listas` más recientes (límite ~60) para mantener
   el prompt acotado en cuentas con historial largo.
3. **Pasada de matching LLM**: para cada candidata, ¿coincide con una existente?
   - **Sí** → no crear; insertar fila en `task_meeting_mentions` (taskId
     existente + este transcript + excerpt/contexto). No se mueve de columna.
   - **No** → crear tarea nueva en columna `auto` + su primera fila en
     `task_meeting_mentions`.
4. **Idempotencia (reintentos):** antes de procesar, borrar las menciones de
   *este* transcript y las tareas en `auto` cuyo único origen sea este transcript
   y sin edición humana (`createdAt === updatedAt`).

### Detección de completadas

La pasada existente que detecta tareas "terminadas en la reunión" se mantiene,
pero **mueve la tarjeta a `listas`** (+ `completedAt`).

## Colaboración

### Comentarios + @menciones

- Caja de comentarios en el drawer de cada tarjeta.
- Al escribir `@`, autocompletado con usuarios **con acceso a esa cuenta**.
- Al guardar: parsear `@usuario`, persistir en `task_comments` + una fila por
  mencionado en `task_comment_mentions`.

### Centro de notificaciones in-app

- Se crea una `notification` cuando: te **mencionan** en un comentario, o te
  **asignan** una tarea (excluyendo al propio actor).
- **Campanita en `app-header.tsx`** con contador de no-leídas → dropdown con la
  lista (link directo a la tarjeta) + "marcar como leída" / "marcar todas".
- Sin realtime por ahora (refresca al cargar y tras cada acción). Trigger.dev
  Realtime queda como mejora futura opcional.

### Adjuntos por link (Drive)

- "Agregar adjunto" en la tarjeta → label + URL → `task_attachments`.
- Render como chip/adjunto visual (ícono link + nombre) que abre la URL en
  pestaña nueva. Nunca se sube ni se descarga el archivo.

## Vistas

### Navegación

- Ítem nuevo en el sidebar: **"Tareas"** (entre Portfolio y Finanzas).
- `/app/tareas` → vista global.
- `/app/tareas/[accountId]` → Kanban por cuenta.
- Ambas gateadas por `getTaskAccessibleAccountIds` (página y actions).

### Vista por cuenta — Kanban completo

- 6 columnas con scroll horizontal, cada una con contador.
- **Tarjeta:** descripción, badge de prioridad, avatar de responsable, `dueDate`
  (color si vencida/próxima), badge `🔁 ×N` si recurrente, íconos de
  adjuntos/comentarios, tilde de "público" bien visible (ojo abierto/cerrado).
- **Click → drawer** lateral: descripción editable, responsable, fecha,
  prioridad, toggle público, adjuntos, menciones de meets, hilo de comentarios.
- **Drag & drop** entre columnas y reordenar dentro (actualiza `status` +
  `sortOrder`).
- Botón "Nueva tarea" por columna.

### Vista global — toggle tablero/lista

- Header con switch Tablero ⇄ Lista + filtros: cuenta, responsable, prioridad,
  columna, rango de fechas, "solo recurrentes", "solo públicas".
- **Tablero:** mismas 6 columnas; cada tarjeta con etiqueta de su cuenta.
- **Lista:** tabla densa ordenable (cuenta · tarea · responsable · columna ·
  fecha · prioridad).
- Solo cuentas accesibles por el usuario.

### Vista pública — Kanban de públicas

- En `lib/queries/public-account.ts`, `loadTasksWithContext` filtra
  `isPublic = true`.
- Render Kanban simplificado, **solo columnas con ≥1 tarea pública** (read-only,
  sin drag, sin comentarios internos).
- Sigue gateado por el boolean `tasks` del `ShareConfig`.

## Drag & drop — dependencia

**`@dnd-kit/core` + `@dnd-kit/sortable`** (mantenida, accesible, liviana).
Alternativas descartadas: drag nativo HTML5 (peor UX táctil/reorden) y botones
de flecha (poco visual).

## Migración

- `npm run db:generate`: alterar `tasks` (check de status, `isPublic`,
  `dueDate`, `sortOrder`) + 5 tablas nuevas.
- **`down.sql` obligatorio** antes de `db:migrate` (workflow del CLAUDE.md).
- Backfill como migración custom SQL: `completed → listas` (preserva
  `completedAt`), `pending → backlog`. La columna `auto` arranca vacía y solo
  recibe extracciones nuevas (no se inunda con histórico).
- **Trigger.dev:** se toca `extract-tasks.ts`; el deploy corre solo en push
  (workflow `.github/workflows/trigger-deploy.yml`). Confirmar que corra.

## Fases de implementación

1. **Schema + migración + backfill** + helper de acceso.
2. **Kanban por cuenta** (CRUD, drag&drop, drawer, fecha, prioridad, asignar,
   toggle público).
3. **Extracción con dedup** + badge recurrente + detección→`listas`.
4. **Comentarios + @menciones + adjuntos**.
5. **Centro de notificaciones** (campanita en header).
6. **Vista global** (toggle tablero/lista + filtros).
7. **Vista pública** (Kanban de públicas) + ajuste del detalle de cuenta.

## Fuera de alcance (por ahora)

- Realtime de notificaciones (polling/refresh es suficiente al inicio).
- Notificaciones por email.
- Subir/almacenar archivos (solo links de Drive).
- Sub-tareas / checklists dentro de una tarjeta.
- Dependencias entre tareas / vista de timeline o Gantt.
