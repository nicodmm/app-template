# Invitados pre-asignables (placeholder users) — Diseño

**Fecha:** 2026-06-16
**Estado:** Aprobado el enfoque general, pendiente revisión del spec por el usuario.

## Problema

Hoy todas las asignaciones (responsable de tarea, consultor de cuenta, dueño de
cuenta, miembro de proyecto) son foreign keys a `users.id`, y `users.id` **es el
Supabase auth UID** (se crea en `ensureUserRecord` recién cuando la persona se
registra). Por lo tanto una persona que fue invitada pero todavía no se registró
**no tiene fila en `users`** — solo una fila en `workspace_invites` con su email.

Resultado: no se le pueden cargar cuentas ni tareas hasta que se registre.

## Objetivo

1. Poder asignar cuentas y tareas (y todo lo demás) a personas invitadas que aún
   no se registraron.
2. Que esa persona aparezca en **todas** las listas de asignación y en la lista de
   miembros del workspace, mostrada con su **email** y un badge "Pendiente".
3. Cuando la persona se registra y carga su nombre, el email se reemplaza
   automáticamente por su nombre en todas las pantallas.

Decisiones tomadas en el brainstorming:
- Aparece en **todo** (tareas, consultor de cuenta, dueño de cuenta, miembros).
- En el formulario de invitación **NO** se escribe nombre: solo email + rol (como
  está hoy). Se muestra el email hasta que la persona se registre y ponga su nombre.

## Enfoque elegido: placeholder users + merge en el registro

Al invitar, además de la fila en `workspace_invites`, se crea un **usuario
placeholder**: una fila real en `users` (email, sin `fullName`, marcada como
pendiente) y su fila en `workspace_members`. A partir de ahí esa persona es un
`userId` normal y funciona en toda la maquinaria de asignación existente sin
tocar nada, porque el display ya es `fullName ?? email` en todos lados.

Cuando la persona se registra, se **fusiona** el placeholder con la cuenta real
(la que Supabase crea con el auth UID): se re-apuntan todas las FK del placeholder
al UID real, se rellena su `fullName` (lo carga la persona en el alta), y se borra
el placeholder. El email pasa a mostrarse como su nombre automáticamente.

### Alternativa descartada: asignaciones polimórficas

Referenciar "user O invite" en cada asignación obligaría a tocar schema + UI +
queries de cada superficie (tareas, consultores, owner, dropdowns). El placeholder
mantiene un único tipo de referencia (`userId`) y reusa `fullName ?? email`. Mucho
menos código y menos riesgo.

## Cambios concretos

### 1. Marcar placeholders en `users`

Agregar columna a `lib/drizzle/schema/users.ts`:

- `pending boolean not null default false`

Un placeholder tiene `pending = true`. Sirve para el badge "Pendiente" en miembros
y para detectar a quién fusionar en el registro. Migración con su `down.sql`.

(Alternativa considerada: `authLinkedAt timestamp`. Se elige `pending` boolean por
simplicidad; un placeholder es `pending=true`, un usuario real `pending=false`.)

### 2. `createWorkspaceInvite` (`app/actions/workspace.ts`)

En la misma transacción que crea el invite:

- Si ya existe un `users` con ese email → usarlo (no crear placeholder).
- Si no existe → insertar placeholder `users { id: randomUUID(), email, pending: true }`.
- Insertar `workspace_members { workspaceId, userId: placeholderId, role }`
  (respetando el unique `(workspace_id, user_id)`).

La deduplicación de invites existente (reusar invite pendiente para el mismo email)
se mantiene.

### 3. Revocar invite (`revokeWorkspaceInvite`)

- Si el placeholder **no** tiene ninguna asignación (no es owner de cuenta, ni
  consultor, ni assignee de tarea, ni miembro de proyecto) → borrar placeholder +
  su `workspace_members` + el invite.
- Si **sí** tiene asignaciones → conservar el placeholder como miembro pendiente
  (para no romper las asignaciones) y solo borrar/expirar el invite. Se comunica en
  la UI.

### 4. Merge en el registro — el corazón

En `ensureUserRecord(authUserId, email)` (`app/actions/auth.ts`), antes de insertar:

1. Buscar placeholder `users` con ese `email` y `pending = true`.
2. Si existe, en una transacción:
   - Asegurar/crear la fila real con `id = authUserId` (vía el upsert actual).
   - **Re-apuntar todas las FK** del `placeholderId` al `authUserId`.
   - Borrar el placeholder.
   - Marcar el `workspace_invites` correspondiente como aceptado
     (`acceptedAt`, `acceptedByUserId = authUserId`).
3. Si no existe placeholder → comportamiento actual (insertar/upsert normal).

El `fullName` lo setea la persona en el alta (flujo de signup actual). El email se
reemplaza por el nombre solo, vía `fullName ?? email`.

**Función única `mergePlaceholderUser(placeholderId, realId)`** en `lib/` que
contiene TODAS las columnas FK→`users` en un solo lugar. Tablas a re-apuntar (a
auditar contra el schema al implementar):

- `accounts.ownerId`
- `account_consultants.userId`
- `tasks.assigneeId`
- `tasks.createdBy`
- `task_projects` (owner/created, según schema)
- `task_project_members.userId`
- `workspace_members.userId`
- `member_compensation` (FK a users)
- `notifications` (actorId / recipient)
- `task_comments` / `task_comment_mentions`

Cuidados durante el re-apuntado:
- `workspace_members`: el unique `(workspace_id, user_id)` — el usuario real no es
  miembro todavía, así que el UPDATE del `userId` no colisiona; si por algún borde
  el real ya fuera miembro, borrar la fila placeholder en lugar de actualizar.
- Cualquier otra tabla con unique sobre `userId`: misma estrategia (update salvo
  colisión, en cuyo caso borrar la del placeholder).

### 5. UI de miembros (`components/workspace-settings-client.tsx`)

- Los placeholders ya aparecen en la lista (tienen `workspace_members`).
- Mostrar badge **"Pendiente"** cuando `pending = true`.
- La query `getWorkspaceMembers` (`lib/queries/workspace.ts`) debe devolver `pending`
  para el badge.
- Cambiar rol / finance_admin sobre un pendiente: permitido.

### 6. Reconciliar el flujo de invite actual

Hoy `acceptWorkspaceInvite` inserta la membresía y bloquea "un workspace por
usuario". Como ahora la membresía ya existe (placeholder), el accept se apoya en el
merge por email en el registro. La regla "un workspace por usuario" se evalúa contra
el placeholder/email.

## Bordes que el spec cubre explícitamente

- **Email ya es de un usuario real registrado:** no se crea placeholder; se usa el
  usuario existente (puede que ya sea miembro de otro workspace → aplica la regla
  de un-workspace-por-usuario).
- **Registro por signup normal (sin link de invite) con el mismo email:** el merge
  por email igual lo engancha (el trigger del merge es el email, no el token).
- **Eliminar/borrar un miembro pendiente con asignaciones:** ver punto 3.
- **Constraint único `(workspace_id, user_id)` durante el re-apuntado:** ver punto 4.

## Testing

- Unit: `mergePlaceholderUser` re-apunta cada FK y borra el placeholder.
- Integración: invitar → asignar tarea + consultor → registrar → verificar que la
  tarea/consultor quedan apuntando al UID real y el display pasa de email a nombre.
- Borde: invitar email de usuario ya registrado (no crea placeholder).
- Borde: revocar invite con/ sin asignaciones.
