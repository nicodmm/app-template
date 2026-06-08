# Tareas: Proyectos sin cuenta + Tareas sueltas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir tareas que no cuelgan de una cuenta-cliente: **proyectos internos con nombre** (Kanban propio, privado del creador + miembros) y **tareas sueltas** (visibles por creador + responsable), reusando todo el Kanban ya construido.

**Architecture:** Una tarea pertenece a **una cuenta, O un proyecto, O nada (suelta)** — `tasks.accountId` pasa a nullable y se agrega `tasks.projectId`. Toda la UI/actions se generalizan a un `TaskScope` discriminado (`account | project | loose`). El acceso de operaciones por-tarea se verifica contra el scope **almacenado** en la fila (no el que manda el cliente). Visibilidad: proyectos = solo miembros (sin bypass de admin); sueltas = creador + assignee.

**Tech Stack:** Next.js 15 (App Router) + React 19, Drizzle ORM + Supabase Postgres, Tailwind v4, `@dnd-kit`. Sin framework de tests: la compuerta es `npm run type-check` + `npm run build` (patrón del módulo; ver `reference_tooling_quirks`).

**Spec:** `docs/superpowers/specs/2026-06-08-tareas-proyectos-sin-cuenta-design.md`

**Convenciones del repo a respetar:**
- Migraciones: `npm run db:generate` → escribir `drizzle/migrations/<name>/down.sql` → `npm run db:migrate` (dev y prod comparten la misma Supabase; no hay `db:migrate:prod` separado).
- Sin `any`, sin `@ts-expect-error`, sin `eslint-disable`, return types explícitos, `next/image`, sin estilos inline.
- Server Actions: `"use server"`, `requireUserId()`, sin toasts.

---

## File Structure

**Crear:**
- `lib/drizzle/schema/task_projects.ts` — tabla `task_projects`
- `lib/drizzle/schema/task_project_members.ts` — tabla `task_project_members`
- `lib/tareas/scope.ts` — tipo `TaskScope` client-safe + helpers de ruta/serialización
- `app/actions/task-projects.ts` — actions de proyectos (crear/renombrar/archivar/borrar/miembros) + `moveTaskToScope`
- `app/(protected)/app/tareas/proyecto/[projectId]/page.tsx` — board de proyecto
- `app/(protected)/app/tareas/mias/page.tsx` — board de tareas sueltas
- `components/tareas/project-board-header.tsx` — header con nombre/color/miembros/archivar
- `components/tareas/new-project-dialog.tsx` — dialog de creación
- `components/tareas/tareas-index.tsx` — índice client (accesos + grid de proyectos + dialog)

**Modificar:**
- `lib/drizzle/schema/tasks.ts` — `accountId` nullable + `projectId` + índice
- `lib/drizzle/schema/index.ts` — exportar las 2 tablas nuevas
- `lib/queries/task-access.ts` — helpers de proyecto + loose + `assertScopeAccess`
- `lib/queries/tareas.ts` — `getProjectKanbanTasks`, `getLooseKanbanTasks`, `listWorkspaceTaskLabels`, `getUserProjects`, `getScopeMoveTargets`; generalizar `getGlobalTasks` + `GlobalTask`
- `app/actions/tareas.ts` — todas las actions pasan de `accountId: string` a `scope: TaskScope`; acceso por-tarea derivado de la fila
- `components/tareas/kanban-board.tsx` — prop `scope` (en vez de `accountId`) + `moveTargets` + handler de mover-de-contenedor
- `components/tareas/task-drawer.tsx` — prop `scope` + selector "Contenedor"
- `components/tareas/task-comments.tsx` — prop `scope` (en vez de `accountId`)
- `components/tareas/global-tasks-view.tsx` — soporte de contenedor (cuenta/proyecto/suelta)
- `app/(protected)/app/tareas/page.tsx` — usar índice nuevo + datos de proyectos/sueltas/global mezclado
- `app/(protected)/app/tareas/[accountId]/page.tsx` — pasar `scope={kind:"account"}` + `moveTargets`

---

## Milestone 1 — Schema y migración

### Task 1: Tablas nuevas y cambios en `tasks`

**Files:**
- Create: `lib/drizzle/schema/task_projects.ts`
- Create: `lib/drizzle/schema/task_project_members.ts`
- Modify: `lib/drizzle/schema/tasks.ts`
- Modify: `lib/drizzle/schema/index.ts`

- [ ] **Step 1: Crear `lib/drizzle/schema/task_projects.ts`**

```ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const taskProjects = pgTable(
  "task_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("task_projects_workspace_idx").on(table.workspaceId)]
);

export type TaskProject = typeof taskProjects.$inferSelect;
export type NewTaskProject = typeof taskProjects.$inferInsert;
```

- [ ] **Step 2: Crear `lib/drizzle/schema/task_project_members.ts`**

```ts
import { pgTable, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";
import { taskProjects } from "./task_projects";
import { users } from "./users";

export const taskProjectMembers = pgTable(
  "task_project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => taskProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })]
);

export type TaskProjectMember = typeof taskProjectMembers.$inferSelect;
export type NewTaskProjectMember = typeof taskProjectMembers.$inferInsert;
```

- [ ] **Step 3: Modificar `lib/drizzle/schema/tasks.ts`** — `accountId` nullable + `projectId` + índice.

Cambiar el bloque de `accountId` (líneas 12-14) de:

```ts
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
```

a:

```ts
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id").references(() => taskProjects.id, {
      onDelete: "cascade",
    }),
```

Agregar el import al inicio (debajo de `import { accounts } from "./accounts";`):

```ts
import { taskProjects } from "./task_projects";
```

Agregar el índice nuevo dentro del array `(table) => [ ... ]` (después de `tasks_parent_idx`):

```ts
    index("tasks_project_idx").on(table.projectId),
```

- [ ] **Step 4: Modificar `lib/drizzle/schema/index.ts`** — exportar las tablas nuevas. Agregar al final:

```ts
export * from "./task_projects";
export * from "./task_project_members";
```

- [ ] **Step 5: Verificar tipos**

Run: `npm run type-check`
Expected: PASS (puede haber errores aguas abajo en actions/queries que asumen `accountId` notNull — si aparecen, son los que resuelven las tareas siguientes; en este punto el schema debe compilar. Si `type-check` falla SOLO por usos de `accountId` posiblemente-null en `app/actions/tareas.ts`/`lib/queries/tareas.ts`, está esperado y se arregla en Milestones 3-4).

> Nota: el `inferInsert` de `tasks` ahora hace `accountId` opcional. Los inserts existentes que pasan `accountId` siguen válidos. Los `eq(tasks.accountId, accountId)` siguen tipando bien porque `accountId` (el parámetro) sigue siendo `string`.

- [ ] **Step 6: Commit**

```bash
git add lib/drizzle/schema/
git commit -m "feat(tareas): schema proyectos + tasks.projectId, accountId nullable"
```

---

### Task 2: Migración + down.sql

**Files:**
- Create: `drizzle/migrations/<NNNN>_<name>.sql` (generado)
- Create: `drizzle/migrations/<NNNN>_<name>/down.sql` (manual)

- [ ] **Step 1: Generar la migración**

Run: `npm run db:generate`
Expected: crea `drizzle/migrations/0039_<random>.sql` con: crear `task_projects`, crear `task_project_members`, `ALTER TABLE tasks ALTER COLUMN account_id DROP NOT NULL`, `ADD COLUMN project_id`, FK de project_id, e índice `tasks_project_idx`.

- [ ] **Step 2: Inspeccionar el SQL generado**

Abrir el `.sql` nuevo y confirmar que contiene (los nombres exactos de FK pueden variar):
- `CREATE TABLE "task_projects" (...)`
- `CREATE TABLE "task_project_members" (...)` con PK compuesta
- `ALTER TABLE "tasks" ALTER COLUMN "account_id" DROP NOT NULL;`
- `ALTER TABLE "tasks" ADD COLUMN "project_id" uuid;`
- `ADD CONSTRAINT ... FOREIGN KEY ("project_id") REFERENCES "public"."task_projects"("id") ON DELETE cascade`
- `CREATE INDEX "tasks_project_idx" ...`

Si falta el `DROP NOT NULL`, agregarlo manualmente al `.sql` antes de migrar.

- [ ] **Step 3: Escribir el down.sql** en `drizzle/migrations/<NNNN>_<name>/down.sql` (mismo `<name>` que el `.sql`). Reemplazar `<fk_name>` por el nombre real del constraint de `project_id` que aparece en el `.sql` (típicamente `tasks_project_id_task_projects_id_fk`):

```sql
DROP INDEX IF EXISTS "tasks_project_idx";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_id_task_projects_id_fk";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "project_id";
ALTER TABLE "tasks" ALTER COLUMN "account_id" SET NOT NULL;
DROP TABLE IF EXISTS "task_project_members";
DROP TABLE IF EXISTS "task_projects";
```

- [ ] **Step 4: Aplicar la migración**

Run: `npm run db:migrate`
Expected: "migration applied" sin errores. (Aplica sobre la Supabase compartida = dev+prod.)

- [ ] **Step 5: Commit**

```bash
git add drizzle/migrations/
git commit -m "feat(tareas): migracion 0039 proyectos sin cuenta (+down)"
```

---

## Milestone 2 — Scope y acceso

### Task 3: `TaskScope` client-safe + helpers de acceso

**Files:**
- Create: `lib/tareas/scope.ts`
- Modify: `lib/queries/task-access.ts`

- [ ] **Step 1: Crear `lib/tareas/scope.ts`** (client-safe, sin imports de servidor):

```ts
// Contenedor de una tarea: cuenta-cliente, proyecto interno, o suelta.
// Client-safe: lo usan tanto RSC como componentes cliente.

export type TaskScope =
  | { kind: "account"; accountId: string }
  | { kind: "project"; projectId: string }
  | { kind: "loose" };

/** Ruta del board para un scope. */
export function scopeBoardPath(scope: TaskScope): string {
  switch (scope.kind) {
    case "account":
      return `/app/tareas/${scope.accountId}`;
    case "project":
      return `/app/tareas/proyecto/${scope.projectId}`;
    case "loose":
      return "/app/tareas/mias";
  }
}

/** Igualdad de scopes (para detectar "no cambió el contenedor"). */
export function sameScope(a: TaskScope, b: TaskScope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "account" && b.kind === "account")
    return a.accountId === b.accountId;
  if (a.kind === "project" && b.kind === "project")
    return a.projectId === b.projectId;
  return true; // ambos loose
}
```

- [ ] **Step 2: Agregar helpers a `lib/queries/task-access.ts`.**

Actualizar el import del tope del archivo de:

```ts
import {
  accounts,
  accountConsultants,
  workspaceMembers,
} from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
```

a:

```ts
import {
  accounts,
  accountConsultants,
  workspaceMembers,
  taskProjects,
  taskProjectMembers,
} from "@/lib/drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { TaskScope } from "@/lib/tareas/scope";
```

Agregar al final del archivo:

```ts
/**
 * Proyectos internos visibles para el usuario: aquellos donde es miembro
 * (`task_project_members`). SIN bypass de admin — privado es privado.
 * Excluye archivados.
 */
export async function getAccessibleProjectIds(
  userId: string,
  workspaceId: string
): Promise<string[]> {
  const rows = await db
    .select({ id: taskProjects.id })
    .from(taskProjectMembers)
    .innerJoin(taskProjects, eq(taskProjects.id, taskProjectMembers.projectId))
    .where(
      and(
        eq(taskProjectMembers.userId, userId),
        eq(taskProjects.workspaceId, workspaceId),
        isNull(taskProjects.archivedAt)
      )
    );
  return rows.map((r) => r.id);
}

/** ¿El usuario es miembro de este proyecto (no archivado)? */
export async function canAccessProject(
  userId: string,
  workspaceId: string,
  projectId: string
): Promise<boolean> {
  const [row] = await db
    .select({ projectId: taskProjectMembers.projectId })
    .from(taskProjectMembers)
    .innerJoin(taskProjects, eq(taskProjects.id, taskProjectMembers.projectId))
    .where(
      and(
        eq(taskProjectMembers.projectId, projectId),
        eq(taskProjectMembers.userId, userId),
        eq(taskProjects.workspaceId, workspaceId),
        isNull(taskProjects.archivedAt)
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Verifica acceso para CREAR/operar en un scope dado (sin tarea previa).
 * - account → reglas de cuenta
 * - project → membresía
 * - loose   → basta estar logueado (el creador será el dueño)
 */
export async function assertScopeAccess(
  userId: string,
  workspaceId: string,
  scope: TaskScope
): Promise<boolean> {
  if (scope.kind === "account")
    return canAccessAccountTasks(userId, workspaceId, scope.accountId);
  if (scope.kind === "project")
    return canAccessProject(userId, workspaceId, scope.projectId);
  return true; // loose
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run type-check`
Expected: sin errores nuevos en `task-access.ts` ni `scope.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/tareas/scope.ts lib/queries/task-access.ts
git commit -m "feat(tareas): TaskScope + helpers de acceso a proyectos/sueltas"
```

---

## Milestone 3 — Actions

### Task 4: Generalizar `app/actions/tareas.ts` a `TaskScope`

Reescribe los helpers de autorización y cambia la firma de cada action de `accountId: string` a `scope: TaskScope`. El acceso de operaciones **por-tarea** se verifica contra el scope almacenado en la fila (más seguro que confiar en el cliente).

**Files:**
- Modify: `app/actions/tareas.ts`

- [ ] **Step 1: Reemplazar imports y helpers de autorización (líneas 1-54).**

Reemplazar el bloque desde el `import` de `task-access` y los helpers `authorize`/`revalidate`/`isColumn`. Imports nuevos a agregar (junto a los existentes): `isNull` de `drizzle-orm`, `getAccessibleProjectIds`/`canAccessProject`/`assertScopeAccess` de task-access, `taskProjects` del schema, y `TaskScope`/`scopeBoardPath` de scope.

Cambiar:

```ts
import { and, eq, sql, inArray } from "drizzle-orm";
```
→
```ts
import { and, eq, sql, inArray, isNull } from "drizzle-orm";
```

Cambiar:
```ts
import {
  canAccessAccountTasks,
  getTaskAccessibleAccountIds,
} from "@/lib/queries/task-access";
```
→
```ts
import {
  canAccessAccountTasks,
  getTaskAccessibleAccountIds,
  canAccessProject,
  getAccessibleProjectIds,
  assertScopeAccess,
} from "@/lib/queries/task-access";
import type { TaskScope } from "@/lib/tareas/scope";
import { scopeBoardPath } from "@/lib/tareas/scope";
```

Reemplazar los helpers `authorize` (líneas 37-44) y `revalidate` (46-50) por:

```ts
/** Autoriza para CREAR en un scope (sin tarea previa). */
async function authorizeScope(
  scope: TaskScope
): Promise<{ workspaceId: string; userId: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const ok = await assertScopeAccess(userId, workspace.id, scope);
  if (!ok) throw new Error("Sin acceso a este contenedor");
  return { workspaceId: workspace.id, userId };
}

interface StoredTask {
  id: string;
  workspaceId: string;
  accountId: string | null;
  projectId: string | null;
  createdBy: string | null;
  assigneeId: string | null;
}

/** Carga la tarea y verifica acceso contra su scope ALMACENADO. */
async function authorizeTask(
  taskId: string
): Promise<{ workspaceId: string; userId: string; task: StoredTask }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const [task] = await db
    .select({
      id: tasks.id,
      workspaceId: tasks.workspaceId,
      accountId: tasks.accountId,
      projectId: tasks.projectId,
      createdBy: tasks.createdBy,
      assigneeId: tasks.assigneeId,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)))
    .limit(1);
  if (!task) throw new Error("Tarea no encontrada");

  let ok = false;
  if (task.accountId)
    ok = await canAccessAccountTasks(userId, workspace.id, task.accountId);
  else if (task.projectId)
    ok = await canAccessProject(userId, workspace.id, task.projectId);
  else ok = task.createdBy === userId || task.assigneeId === userId;
  if (!ok) throw new Error("Sin acceso a esta tarea");

  return { workspaceId: workspace.id, userId, task };
}

function revalidate(scope: TaskScope): void {
  revalidatePath(scopeBoardPath(scope));
  revalidatePath("/app/tareas");
  if (scope.kind === "account")
    revalidatePath(`/app/accounts/${scope.accountId}`);
}

/** Condición Drizzle "esta tarea pertenece a este scope" (para max sortOrder). */
function scopeColumnFilter(scope: TaskScope, userId: string) {
  if (scope.kind === "account") return eq(tasks.accountId, scope.accountId);
  if (scope.kind === "project") return eq(tasks.projectId, scope.projectId);
  return and(
    isNull(tasks.accountId),
    isNull(tasks.projectId),
    eq(tasks.createdBy, userId)
  );
}
```

- [ ] **Step 2: Reescribir `moveTask`, `createKanbanTask`, `createSubtask`** (firmas con `scope`).

`moveTask`:

```ts
export async function moveTask(
  taskId: string,
  scope: TaskScope,
  toColumn: string,
  newSortOrder: number
): Promise<{ error?: string }> {
  const { workspaceId } = await authorizeTask(taskId);
  if (!isColumn(toColumn)) return { error: "Columna inválida" };
  await db
    .update(tasks)
    .set({
      status: toColumn,
      sortOrder: newSortOrder,
      completedAt: isDoneColumn(toColumn) ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));
  revalidate(scope);
  return {};
}
```

`createKanbanTask` (setea `accountId`/`projectId` según scope):

```ts
export async function createKanbanTask(
  scope: TaskScope,
  column: string,
  title: string,
  priority: number,
  assigneeId: string | null,
  dueDate: string | null
): Promise<{ id?: string; error?: string }> {
  const { workspaceId, userId } = await authorizeScope(scope);
  if (!isColumn(column)) return { error: "Columna inválida" };
  if (!title.trim()) return { error: "El título es requerido" };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${tasks.sortOrder}), 0)` })
    .from(tasks)
    .where(and(scopeColumnFilter(scope, userId), eq(tasks.status, column)));

  const [created] = await db
    .insert(tasks)
    .values({
      accountId: scope.kind === "account" ? scope.accountId : null,
      projectId: scope.kind === "project" ? scope.projectId : null,
      workspaceId,
      createdBy: userId,
      assigneeId: assigneeId || null,
      title: title.trim(),
      description: "",
      priority,
      status: column,
      source: "manual",
      sortOrder: Number(maxOrder) + 1,
      dueDate: dueDate || null,
    })
    .returning({ id: tasks.id });
  revalidate(scope);
  return { id: created.id };
}
```

`createSubtask` (hereda contenedor del padre, acceso vía padre):

```ts
export async function createSubtask(
  scope: TaskScope,
  parentTaskId: string,
  title: string
): Promise<{ id?: string; error?: string }> {
  if (!title.trim()) return { error: "El título es requerido" };
  const { workspaceId, userId, task: parent } = await authorizeTask(parentTaskId);

  const [created] = await db
    .insert(tasks)
    .values({
      accountId: parent.accountId,
      projectId: parent.projectId,
      workspaceId,
      createdBy: userId,
      parentTaskId,
      title: title.trim(),
      description: "",
      priority: 3,
      status: "backlog",
      source: "manual",
      sortOrder: 0,
    })
    .returning({ id: tasks.id });
  revalidate(scope);
  return { id: created.id };
}
```

- [ ] **Step 3: Reescribir `updateTaskFields` y `deleteKanbanTask`.**

`updateTaskFields` — usa `authorizeTask`; la notificación de asignación usa `accountId`/`projectId` de la tarea almacenada:

```ts
export async function updateTaskFields(
  taskId: string,
  scope: TaskScope,
  fields: {
    title?: string;
    description?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    isPublic?: boolean;
  }
): Promise<{ error?: string }> {
  const { workspaceId, userId, task } = await authorizeTask(taskId);

  const [before] = await db
    .select({
      assigneeId: tasks.assigneeId,
      title: tasks.title,
      description: tasks.description,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!before) return { error: "Tarea no encontrada" };

  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (fields.title !== undefined) patch.title = fields.title.trim() || null;
  if (fields.description !== undefined) {
    if (!fields.description.trim())
      return { error: "La descripción es requerida" };
    patch.description = fields.description.trim();
  }
  if (fields.priority !== undefined) patch.priority = fields.priority;
  if (fields.assigneeId !== undefined)
    patch.assigneeId = fields.assigneeId || null;
  if (fields.dueDate !== undefined) patch.dueDate = fields.dueDate || null;
  if (fields.isPublic !== undefined) patch.isPublic = fields.isPublic;

  await db
    .update(tasks)
    .set(patch)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));

  const newAssignee = fields.assigneeId;
  if (newAssignee && newAssignee !== before.assigneeId && newAssignee !== userId) {
    const [actor] = await db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const label = before.title || before.description || "una tarea";
    const snippet = label.length > 80 ? `${label.slice(0, 80)}…` : label;
    await db.insert(notifications).values({
      workspaceId,
      userId: newAssignee,
      type: "assignment",
      taskId,
      accountId: task.accountId,
      actorId: userId,
      body: `${actor?.name ?? "Alguien"} te asignó: "${snippet}"`,
    });
  }

  revalidate(scope);
  return {};
}
```

`deleteKanbanTask`:

```ts
export async function deleteKanbanTask(
  taskId: string,
  scope: TaskScope
): Promise<{ error?: string }> {
  const { workspaceId } = await authorizeTask(taskId);
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));
  revalidate(scope);
  return {};
}
```

> `notifications.accountId` ya es nullable en el schema (no tiene `.notNull()`), así que `accountId: task.accountId` (que puede ser null para tareas de proyecto/sueltas) es válido. No requiere migración extra.

- [ ] **Step 4: Reescribir labels (`createLabel`, `assignLabel`, `unassignLabel`) y el helper `assertTaskInAccount`.**

Eliminar `assertTaskInAccount` (ya no se usa; `authorizeTask` lo reemplaza). `createLabel` solo necesita el workspace del usuario:

```ts
export async function createLabel(
  scope: TaskScope,
  name: string,
  color: string
): Promise<{ label?: TaskLabel; error?: string }> {
  const { workspaceId } = await authorizeScope(scope);
  if (!name.trim()) return { error: "El nombre es requerido" };
  if (!isLabelColor(color)) return { error: "Color inválido" };
  const [created] = await db
    .insert(taskLabels)
    .values({ workspaceId, name: name.trim(), color })
    .returning({
      id: taskLabels.id,
      name: taskLabels.name,
      color: taskLabels.color,
    });
  revalidate(scope);
  return { label: { id: created.id, name: created.name, color: created.color } };
}

export async function assignLabel(
  taskId: string,
  scope: TaskScope,
  labelId: string
): Promise<{ error?: string }> {
  const { workspaceId } = await authorizeTask(taskId);
  const [lbl] = await db
    .select({ id: taskLabels.id })
    .from(taskLabels)
    .where(and(eq(taskLabels.id, labelId), eq(taskLabels.workspaceId, workspaceId)))
    .limit(1);
  if (!lbl) return { error: "Etiqueta no encontrada" };
  await db
    .insert(taskLabelAssignments)
    .values({ taskId, labelId })
    .onConflictDoNothing();
  revalidate(scope);
  return {};
}

export async function unassignLabel(
  taskId: string,
  scope: TaskScope,
  labelId: string
): Promise<{ error?: string }> {
  await authorizeTask(taskId);
  await db
    .delete(taskLabelAssignments)
    .where(
      and(
        eq(taskLabelAssignments.taskId, taskId),
        eq(taskLabelAssignments.labelId, labelId)
      )
    );
  revalidate(scope);
  return {};
}
```

- [ ] **Step 5: Reescribir comentarios/adjuntos (`loadTaskThread`, `addComment`, `deleteComment`, `addAttachment`, `deleteAttachment`).**

```ts
export async function loadTaskThread(
  taskId: string,
  scope: TaskScope
): Promise<{ thread?: TaskThread; error?: string }> {
  await authorizeTask(taskId);
  void scope;
  return { thread: await getTaskThread(taskId) };
}

export async function addComment(
  taskId: string,
  scope: TaskScope,
  body: string,
  mentionedUserIds: string[]
): Promise<{ comment?: TaskCommentView; error?: string }> {
  const { workspaceId, userId, task } = await authorizeTask(taskId);
  const text = body.trim();
  if (!text) return { error: "El comentario está vacío" };

  const [comment] = await db
    .insert(taskComments)
    .values({ taskId, workspaceId, authorId: userId, body: text })
    .returning({ id: taskComments.id, createdAt: taskComments.createdAt });

  let validMentions: string[] = [];
  if (mentionedUserIds.length > 0) {
    const unique = [...new Set(mentionedUserIds)].filter((id) => id !== userId);
    if (unique.length > 0) {
      const members = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            inArray(workspaceMembers.userId, unique)
          )
        );
      validMentions = members.map((m) => m.userId);
    }
  }

  if (validMentions.length > 0) {
    await db.insert(taskCommentMentions).values(
      validMentions.map((mentionedUserId) => ({
        commentId: comment.id,
        mentionedUserId,
      }))
    );
    const [author] = await db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const actorName = author?.name ?? "Alguien";
    const snippet = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    await db.insert(notifications).values(
      validMentions.map((mentionedUser) => ({
        workspaceId,
        userId: mentionedUser,
        type: "mention",
        taskId,
        accountId: task.accountId,
        actorId: userId,
        commentId: comment.id,
        body: `${actorName} te mencionó: "${snippet}"`,
      }))
    );
  }

  revalidate(scope);
  return {
    comment: {
      id: comment.id,
      body: text,
      authorId: userId,
      authorName: null,
      createdAt: comment.createdAt,
      mentionedUserIds: validMentions,
    },
  };
}

export async function deleteComment(
  commentId: string,
  scope: TaskScope
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const [row] = await db
    .select({ authorId: taskComments.authorId, taskId: taskComments.taskId })
    .from(taskComments)
    .where(eq(taskComments.id, commentId))
    .limit(1);
  if (!row) return { error: "Comentario no encontrado" };
  // Verifica acceso a la tarea dueña del comentario.
  await authorizeTask(row.taskId);
  if (row.authorId !== userId) return { error: "No autorizado" };
  await db.delete(taskComments).where(eq(taskComments.id, commentId));
  revalidate(scope);
  return {};
}

export async function addAttachment(
  taskId: string,
  scope: TaskScope,
  label: string,
  url: string
): Promise<{ attachment?: TaskAttachment; error?: string }> {
  const { userId } = await authorizeTask(taskId);
  const cleanUrl = url.trim();
  const cleanLabel = label.trim() || cleanUrl;
  if (!/^https?:\/\//i.test(cleanUrl))
    return { error: "El link debe empezar con http(s)://" };
  const [attachment] = await db
    .insert(taskAttachments)
    .values({ taskId, label: cleanLabel, url: cleanUrl, createdBy: userId })
    .returning();
  revalidate(scope);
  return { attachment };
}

export async function deleteAttachment(
  attachmentId: string,
  scope: TaskScope
): Promise<{ error?: string }> {
  const [row] = await db
    .select({ taskId: taskAttachments.taskId })
    .from(taskAttachments)
    .where(eq(taskAttachments.id, attachmentId))
    .limit(1);
  if (!row) return { error: "Adjunto no encontrado" };
  await authorizeTask(row.taskId);
  await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
  revalidate(scope);
  return {};
}
```

> Tras esto, `getTaskAccessibleAccountIds` puede quedar sin uso en este archivo. Quitar el import si `type-check` lo marca como no usado (o dejarlo si se usa en `deleteComment` anterior — ya no). Ajustar imports según lo que marque el compilador.

- [ ] **Step 6: Verificar tipos**

Run: `npm run type-check`
Expected: este archivo compila. Aparecerán errores en `kanban-board.tsx`, `task-drawer.tsx`, `task-comments.tsx`, `global-tasks-view.tsx` y las páginas (siguen llamando con `accountId`) — se arreglan en Milestones 5-6. Confirmar que NO hay errores dentro de `app/actions/tareas.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/actions/tareas.ts
git commit -m "feat(tareas): actions generalizadas a TaskScope + acceso por tarea almacenada"
```

---

### Task 5: Actions de proyectos + mover de contenedor

**Files:**
- Create: `app/actions/task-projects.ts`

- [ ] **Step 1: Crear `app/actions/task-projects.ts`**

```ts
"use server";

import { db } from "@/lib/drizzle/db";
import {
  taskProjects,
  taskProjectMembers,
  tasks,
  workspaceMembers,
} from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { canAccessProject, assertScopeAccess } from "@/lib/queries/task-access";
import { isLabelColor } from "@/lib/tareas/labels";
import type { TaskScope } from "@/lib/tareas/scope";
import { scopeBoardPath } from "@/lib/tareas/scope";
import { revalidatePath } from "next/cache";

async function requireWorkspace(): Promise<{ workspaceId: string; userId: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  return { workspaceId: workspace.id, userId };
}

export async function createProject(
  name: string,
  color: string | null,
  description: string | null
): Promise<{ id?: string; error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!name.trim()) return { error: "El nombre es requerido" };
  if (color && !isLabelColor(color)) return { error: "Color inválido" };

  const [project] = await db
    .insert(taskProjects)
    .values({
      workspaceId,
      name: name.trim(),
      color: color || null,
      description: description?.trim() || null,
      createdBy: userId,
    })
    .returning({ id: taskProjects.id });

  await db
    .insert(taskProjectMembers)
    .values({ projectId: project.id, userId })
    .onConflictDoNothing();

  revalidatePath("/app/tareas");
  return { id: project.id };
}

export async function updateProject(
  projectId: string,
  fields: { name?: string; color?: string | null; description?: string | null }
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!(await canAccessProject(userId, workspaceId, projectId)))
    return { error: "Sin acceso al proyecto" };
  const patch: Partial<typeof taskProjects.$inferInsert> = { updatedAt: new Date() };
  if (fields.name !== undefined) {
    if (!fields.name.trim()) return { error: "El nombre es requerido" };
    patch.name = fields.name.trim();
  }
  if (fields.color !== undefined) {
    if (fields.color && !isLabelColor(fields.color))
      return { error: "Color inválido" };
    patch.color = fields.color || null;
  }
  if (fields.description !== undefined)
    patch.description = fields.description?.trim() || null;

  await db
    .update(taskProjects)
    .set(patch)
    .where(and(eq(taskProjects.id, projectId), eq(taskProjects.workspaceId, workspaceId)));
  revalidatePath(`/app/tareas/proyecto/${projectId}`);
  revalidatePath("/app/tareas");
  return {};
}

export async function archiveProject(
  projectId: string,
  archived: boolean
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!archived) {
    // Para des-archivar el guard de canAccessProject excluye archivados;
    // verificamos membresía directamente.
    const [m] = await db
      .select({ projectId: taskProjectMembers.projectId })
      .from(taskProjectMembers)
      .where(
        and(
          eq(taskProjectMembers.projectId, projectId),
          eq(taskProjectMembers.userId, userId)
        )
      )
      .limit(1);
    if (!m) return { error: "Sin acceso al proyecto" };
  } else if (!(await canAccessProject(userId, workspaceId, projectId))) {
    return { error: "Sin acceso al proyecto" };
  }
  await db
    .update(taskProjects)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(taskProjects.id, projectId), eq(taskProjects.workspaceId, workspaceId)));
  revalidatePath("/app/tareas");
  revalidatePath(`/app/tareas/proyecto/${projectId}`);
  return {};
}

export async function deleteProject(
  projectId: string
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  const [project] = await db
    .select({ createdBy: taskProjects.createdBy })
    .from(taskProjects)
    .where(and(eq(taskProjects.id, projectId), eq(taskProjects.workspaceId, workspaceId)))
    .limit(1);
  if (!project) return { error: "Proyecto no encontrado" };
  if (project.createdBy !== userId)
    return { error: "Solo el creador puede borrar el proyecto" };
  // Cascade borra tareas, miembros y subtareas del proyecto.
  await db.delete(taskProjects).where(eq(taskProjects.id, projectId));
  revalidatePath("/app/tareas");
  return {};
}

export async function addProjectMember(
  projectId: string,
  newUserId: string
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!(await canAccessProject(userId, workspaceId, projectId)))
    return { error: "Sin acceso al proyecto" };
  // El nuevo miembro debe ser del mismo workspace.
  const [member] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, newUserId)
      )
    )
    .limit(1);
  if (!member) return { error: "El usuario no pertenece al workspace" };
  await db
    .insert(taskProjectMembers)
    .values({ projectId, userId: newUserId })
    .onConflictDoNothing();
  revalidatePath(`/app/tareas/proyecto/${projectId}`);
  return {};
}

export async function removeProjectMember(
  projectId: string,
  targetUserId: string
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!(await canAccessProject(userId, workspaceId, projectId)))
    return { error: "Sin acceso al proyecto" };
  const [project] = await db
    .select({ createdBy: taskProjects.createdBy })
    .from(taskProjects)
    .where(eq(taskProjects.id, projectId))
    .limit(1);
  if (project?.createdBy === targetUserId)
    return { error: "No se puede quitar al creador del proyecto" };
  await db
    .delete(taskProjectMembers)
    .where(
      and(
        eq(taskProjectMembers.projectId, projectId),
        eq(taskProjectMembers.userId, targetUserId)
      )
    );
  revalidatePath(`/app/tareas/proyecto/${projectId}`);
  return {};
}

/**
 * Mueve una tarea de un contenedor a otro (cuenta ↔ proyecto ↔ suelta).
 * Verifica acceso al ORIGEN (vía la tarea) y al DESTINO (vía scope).
 */
export async function moveTaskToScope(
  taskId: string,
  toScope: TaskScope
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();

  const [task] = await db
    .select({
      accountId: tasks.accountId,
      projectId: tasks.projectId,
      createdBy: tasks.createdBy,
      assigneeId: tasks.assigneeId,
      parentTaskId: tasks.parentTaskId,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
    .limit(1);
  if (!task) return { error: "Tarea no encontrada" };
  if (task.parentTaskId)
    return { error: "Mové la tarea padre; las subtareas la siguen" };

  // Acceso al origen.
  const { canAccessAccountTasks } = await import("@/lib/queries/task-access");
  let originOk = false;
  if (task.accountId)
    originOk = await canAccessAccountTasks(userId, workspaceId, task.accountId);
  else if (task.projectId)
    originOk = await canAccessProject(userId, workspaceId, task.projectId);
  else originOk = task.createdBy === userId || task.assigneeId === userId;
  if (!originOk) return { error: "Sin acceso a la tarea" };

  // Acceso al destino.
  if (!(await assertScopeAccess(userId, workspaceId, toScope)))
    return { error: "Sin acceso al contenedor destino" };

  await db
    .update(tasks)
    .set({
      accountId: toScope.kind === "account" ? toScope.accountId : null,
      projectId: toScope.kind === "project" ? toScope.projectId : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));

  // Las subtareas heredan el nuevo contenedor.
  await db
    .update(tasks)
    .set({
      accountId: toScope.kind === "account" ? toScope.accountId : null,
      projectId: toScope.kind === "project" ? toScope.projectId : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.parentTaskId, taskId), eq(tasks.workspaceId, workspaceId)));

  revalidatePath(scopeBoardPath(toScope));
  revalidatePath("/app/tareas");
  return {};
}
```

> El `await import(...)` dinámico de `canAccessAccountTasks` evita un import circular si lo hubiera; si `type-check`/`build` no se quejan con un import normal arriba, preferí el import estático (agregarlo al bloque de imports y borrar el dinámico).

- [ ] **Step 2: Verificar tipos**

Run: `npm run type-check`
Expected: `task-projects.ts` compila (los errores restantes siguen siendo client components/páginas).

- [ ] **Step 3: Commit**

```bash
git add app/actions/task-projects.ts
git commit -m "feat(tareas): actions de proyectos + miembros + moveTaskToScope"
```

---

## Milestone 4 — Queries

### Task 6: Queries de board por scope + targets de mover

**Files:**
- Modify: `lib/queries/tareas.ts`

- [ ] **Step 1: Extraer el `select` compartido y agregar `getProjectKanbanTasks` / `getLooseKanbanTasks` / `listWorkspaceTaskLabels`.**

En `getAccountKanbanTasks` el cuerpo arma `rows` con un `.where(eq(tasks.accountId, accountId))`. Refactorizar para compartir la construcción. Reemplazar `getAccountKanbanTasks` (líneas 51-116) por una función privada `kanbanTasksWhere` + tres exports. Agregar `isNull` ya está importado (línea 14 incluye `isNull`). Agregar `SQL` type import si hace falta:

```ts
import type { SQL } from "drizzle-orm";
```

Reemplazo:

```ts
async function kanbanTasksByWhere(where: SQL): Promise<KanbanTask[]> {
  const assigneeUser = alias(users, "assignee_user");

  const rows = await db
    .select({
      task: tasks,
      meetingDate: transcripts.meetingDate,
      meetingCreatedAt: transcripts.createdAt,
      transcriptFileName: transcripts.fileName,
      assigneeName: assigneeUser.fullName,
      mentionCount: sql<number>`(
        select count(*) from ${taskMeetingMentions}
        where ${taskMeetingMentions.taskId} = ${tasks.id}
      )`,
      commentCount: sql<number>`(
        select count(*) from ${taskComments}
        where ${taskComments.taskId} = ${tasks.id}
      )`,
      attachmentCount: sql<number>`(
        select count(*) from ${taskAttachments}
        where ${taskAttachments.taskId} = ${tasks.id}
      )`,
    })
    .from(tasks)
    .leftJoin(transcripts, eq(tasks.transcriptId, transcripts.id))
    .leftJoin(assigneeUser, eq(tasks.assigneeId, assigneeUser.id))
    .where(where)
    .orderBy(asc(tasks.sortOrder), asc(tasks.priority));

  const taskIds = rows.map((r) => r.task.id);
  const labelRows =
    taskIds.length > 0
      ? await db
          .select({
            taskId: taskLabelAssignments.taskId,
            id: taskLabels.id,
            name: taskLabels.name,
            color: taskLabels.color,
          })
          .from(taskLabelAssignments)
          .innerJoin(taskLabels, eq(taskLabelAssignments.labelId, taskLabels.id))
          .where(inArray(taskLabelAssignments.taskId, taskIds))
      : [];

  const labelsByTask = new Map<string, TaskLabel[]>();
  for (const l of labelRows) {
    const arr = labelsByTask.get(l.taskId) ?? [];
    arr.push({ id: l.id, name: l.name, color: l.color });
    labelsByTask.set(l.taskId, arr);
  }

  return rows.map((r) => ({
    ...r.task,
    column: normalizeColumn(r.task.status),
    meetingDate: r.meetingDate ?? null,
    meetingCreatedAt: r.meetingCreatedAt ?? null,
    transcriptFileName: r.transcriptFileName ?? null,
    assigneeName: r.assigneeName ?? null,
    mentionCount: Number(r.mentionCount ?? 0),
    commentCount: Number(r.commentCount ?? 0),
    attachmentCount: Number(r.attachmentCount ?? 0),
    labels: labelsByTask.get(r.task.id) ?? [],
  }));
}

export async function getAccountKanbanTasks(
  accountId: string
): Promise<KanbanTask[]> {
  return kanbanTasksByWhere(eq(tasks.accountId, accountId));
}

export async function getProjectKanbanTasks(
  projectId: string
): Promise<KanbanTask[]> {
  return kanbanTasksByWhere(eq(tasks.projectId, projectId));
}

/** Tareas sueltas (sin cuenta ni proyecto) visibles por el usuario. */
export async function getLooseKanbanTasks(
  userId: string,
  workspaceId: string
): Promise<KanbanTask[]> {
  const where = and(
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.accountId),
    isNull(tasks.projectId),
    or(eq(tasks.createdBy, userId), eq(tasks.assigneeId, userId))
  ) as SQL;
  return kanbanTasksByWhere(where);
}
```

Agregar `or` al import de drizzle-orm (línea 14): `import { eq, and, asc, desc, sql, inArray, isNull, or } from "drizzle-orm";`

> Nota loose+subtareas: el board agrupa por `parentTaskId IS NULL`, y las subtareas de una tarea suelta comparten `createdBy`, así que el filtro `or(createdBy, assigneeId)` las trae. Si una subtarea tiene otro assignee y el padre no, podría no traerse; es aceptable para v1 (las subtareas se editan desde el drawer del padre, que sí se trae).

- [ ] **Step 2: Agregar `listWorkspaceTaskLabels`, `getUserProjects`, `getScopeMoveTargets`.**

Reemplazar `listAccountTaskLabels` (final del archivo) — mantenerla y agregar debajo:

```ts
export async function listWorkspaceTaskLabels(
  workspaceId: string
): Promise<TaskLabel[]> {
  const rows = await db
    .select({ id: taskLabels.id, name: taskLabels.name, color: taskLabels.color })
    .from(taskLabels)
    .where(eq(taskLabels.workspaceId, workspaceId))
    .orderBy(asc(taskLabels.name));
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}

export interface ProjectSummary {
  id: string;
  name: string;
  color: string | null;
  taskCount: number;
}

/** Proyectos donde el usuario es miembro (no archivados) + conteo de tareas top-level. */
export async function getUserProjects(
  userId: string,
  workspaceId: string
): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: taskProjects.id,
      name: taskProjects.name,
      color: taskProjects.color,
      taskCount: sql<number>`(
        select count(*) from ${tasks}
        where ${tasks.projectId} = ${taskProjects.id}
          and ${tasks.parentTaskId} is null
      )`,
    })
    .from(taskProjectMembers)
    .innerJoin(taskProjects, eq(taskProjects.id, taskProjectMembers.projectId))
    .where(
      and(
        eq(taskProjectMembers.userId, userId),
        eq(taskProjects.workspaceId, workspaceId),
        isNull(taskProjects.archivedAt)
      )
    )
    .orderBy(asc(taskProjects.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color ?? null,
    taskCount: Number(r.taskCount ?? 0),
  }));
}

export interface ScopeMoveTargets {
  accounts: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}

/** Destinos a los que el usuario puede MOVER una tarea (cuentas + proyectos accesibles). */
export async function getScopeMoveTargets(
  accountIds: string[],
  projectIds: string[]
): Promise<ScopeMoveTargets> {
  const [accountRows, projectRows] = await Promise.all([
    accountIds.length > 0
      ? db
          .select({ id: accounts.id, name: accounts.name })
          .from(accounts)
          .where(inArray(accounts.id, accountIds))
          .orderBy(accounts.name)
      : Promise.resolve([]),
    projectIds.length > 0
      ? db
          .select({ id: taskProjects.id, name: taskProjects.name })
          .from(taskProjects)
          .where(inArray(taskProjects.id, projectIds))
          .orderBy(taskProjects.name)
      : Promise.resolve([]),
  ]);
  return { accounts: accountRows, projects: projectRows };
}
```

Agregar imports de `taskProjects`, `taskProjectMembers` al bloque de schema (líneas 2-13).

- [ ] **Step 3: Generalizar `getGlobalTasks` + `GlobalTask` (incluir proyectos y sueltas).**

Reemplazar la interfaz `GlobalTask` (118-131) y la función `getGlobalTasks` (133-178) por:

```ts
export type ContainerKind = "account" | "project" | "loose";

export interface GlobalTask {
  id: string;
  containerKind: ContainerKind;
  containerId: string | null; // null para loose
  containerName: string; // nombre de cuenta/proyecto o "Mis tareas"
  title: string | null;
  description: string;
  column: TareaColumnKey;
  priority: number;
  dueDate: string | null;
  isPublic: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  mentionCount: number;
}

/**
 * Todas las tareas top-level accesibles para la vista global: cuentas accesibles
 * + proyectos donde es miembro + sus tareas sueltas. Una sola query con leftJoins.
 */
export async function getGlobalTasks(params: {
  userId: string;
  workspaceId: string;
  accountIds: string[];
  projectIds: string[];
}): Promise<GlobalTask[]> {
  const { userId, workspaceId, accountIds, projectIds } = params;
  const assigneeUser = alias(users, "assignee_user_global");

  const conditions: SQL[] = [];
  if (accountIds.length > 0)
    conditions.push(inArray(tasks.accountId, accountIds) as SQL);
  if (projectIds.length > 0)
    conditions.push(inArray(tasks.projectId, projectIds) as SQL);
  conditions.push(
    and(
      isNull(tasks.accountId),
      isNull(tasks.projectId),
      or(eq(tasks.createdBy, userId), eq(tasks.assigneeId, userId))
    ) as SQL
  );

  const rows = await db
    .select({
      id: tasks.id,
      accountId: tasks.accountId,
      projectId: tasks.projectId,
      accountName: accounts.name,
      projectName: taskProjects.name,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      isPublic: tasks.isPublic,
      assigneeId: tasks.assigneeId,
      assigneeName: assigneeUser.fullName,
      mentionCount: sql<number>`(
        select count(*) from ${taskMeetingMentions}
        where ${taskMeetingMentions.taskId} = ${tasks.id}
      )`,
    })
    .from(tasks)
    .leftJoin(accounts, eq(accounts.id, tasks.accountId))
    .leftJoin(taskProjects, eq(taskProjects.id, tasks.projectId))
    .leftJoin(assigneeUser, eq(tasks.assigneeId, assigneeUser.id))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.parentTaskId),
        or(...conditions)
      )
    )
    .orderBy(asc(tasks.sortOrder), asc(tasks.priority));

  return rows.map((r) => {
    const kind: ContainerKind = r.accountId
      ? "account"
      : r.projectId
      ? "project"
      : "loose";
    return {
      id: r.id,
      containerKind: kind,
      containerId: r.accountId ?? r.projectId ?? null,
      containerName:
        kind === "account"
          ? r.accountName ?? "Cuenta"
          : kind === "project"
          ? r.projectName ?? "Proyecto"
          : "Mis tareas",
      title: r.title,
      description: r.description,
      column: normalizeColumn(r.status),
      priority: r.priority,
      dueDate: r.dueDate ?? null,
      isPublic: r.isPublic,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName ?? null,
      mentionCount: Number(r.mentionCount ?? 0),
    };
  });
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run type-check`
Expected: `lib/queries/tareas.ts` compila. Quedan errores en `global-tasks-view.tsx` (usa `accountId`/`accountName`) y en la página índice (llama `getGlobalTasks(accountIds)` con la firma vieja) — se arreglan en Milestones 5-6.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/tareas.ts
git commit -m "feat(tareas): queries de board por scope + global mezclada + proyectos"
```

---

## Milestone 5 — Componentes cliente

### Task 7: `KanbanBoard`, `TaskDrawer`, `TaskComments` → `scope` + mover de contenedor

**Files:**
- Modify: `components/tareas/kanban-board.tsx`
- Modify: `components/tareas/task-drawer.tsx`
- Modify: `components/tareas/task-comments.tsx`

- [ ] **Step 1: `task-comments.tsx` — reemplazar `accountId` por `scope`.**

Import: agregar `import type { TaskScope } from "@/lib/tareas/scope";`

Cambiar la interfaz:
```ts
interface TaskCommentsProps {
  taskId: string;
  scope: TaskScope;
  members: WorkspaceMemberWithUser[];
  currentUserId: string | null;
}
```

En la firma de `TaskComments({ taskId, accountId, ... })` cambiar `accountId` por `scope`. Reemplazar las 4 llamadas: `loadTaskThread(taskId, scope)`, `addComment(taskId, scope, text, mentioned)`, `deleteComment(comment.id, scope)`, `addAttachment(taskId, scope, attLabel, attUrl)`, `deleteAttachment(att.id, scope)`. En el `useEffect` de carga, cambiar el dep array de `[taskId, accountId]` a `[taskId, scope]`.

- [ ] **Step 2: `task-drawer.tsx` — prop `scope`, selector "Contenedor", pasar scope a comments.**

Imports: agregar
```ts
import type { TaskScope } from "@/lib/tareas/scope";
```

Cambiar la interfaz `TaskDrawerProps`: reemplazar `accountId: string;` por:
```ts
  scope: TaskScope;
  moveTargets: { accounts: { id: string; name: string }[]; projects: { id: string; name: string }[] };
  onMoveScope: (toScope: TaskScope) => void;
```

En la firma del componente cambiar `accountId` por `scope, moveTargets, onMoveScope`.

En el `<TaskComments .../>` (línea ~514) cambiar `accountId={accountId}` por `scope={scope}`.

Agregar el selector "Contenedor" — insertarlo después del bloque "Priority" (después de su `</div>` de cierre, antes del bloque "Public toggle"), solo para tareas top-level:

```tsx
          {/* Contenedor (mover entre cuenta / proyecto / suelta) */}
          {!task.parentTaskId && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Contenedor
              </label>
              <select
                value={
                  scope.kind === "account"
                    ? `account:${scope.accountId}`
                    : scope.kind === "project"
                    ? `project:${scope.projectId}`
                    : "loose"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "loose") onMoveScope({ kind: "loose" });
                  else if (v.startsWith("account:"))
                    onMoveScope({ kind: "account", accountId: v.slice(8) });
                  else if (v.startsWith("project:"))
                    onMoveScope({ kind: "project", projectId: v.slice(8) });
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="loose">Mis tareas (suelta)</option>
                {moveTargets.projects.length > 0 && (
                  <optgroup label="Proyectos">
                    {moveTargets.projects.map((p) => (
                      <option key={p.id} value={`project:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {moveTargets.accounts.length > 0 && (
                  <optgroup label="Cuentas">
                    {moveTargets.accounts.map((a) => (
                      <option key={a.id} value={`account:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
```

- [ ] **Step 3: `kanban-board.tsx` — prop `scope` + `moveTargets`, llamadas a actions con scope, handler `moveScope`.**

Imports: cambiar
```ts
import type { KanbanTask, TaskLabel } from "@/lib/queries/tareas";
```
agregando debajo:
```ts
import type { TaskScope } from "@/lib/tareas/scope";
import { moveTaskToScope } from "@/app/actions/task-projects";
```

Cambiar la interfaz:
```ts
interface KanbanBoardProps {
  scope: TaskScope;
  currentUserId: string | null;
  initialTasks: KanbanTask[];
  members: WorkspaceMemberWithUser[];
  labels: TaskLabel[];
  moveTargets: { accounts: { id: string; name: string }[]; projects: { id: string; name: string }[] };
}
```

En la firma `export function KanbanBoard({ accountId, currentUserId, initialTasks, members, labels })` → `{ scope, currentUserId, initialTasks, members, labels, moveTargets }`.

Reemplazar **todas** las llamadas a actions que pasaban `accountId` por `scope`:
- `moveTask(activeId, accountId, to, insertAt)` → `moveTask(activeId, scope, to, insertAt)` (2 sitios: `handleDragEnd` y `moveTaskToColumn`)
- `moveTask(taskId, accountId, to, 0)` → `moveTask(taskId, scope, to, 0)` (en `setTaskColumn`)
- `createSubtask(accountId, parentTaskId, title)` → `createSubtask(scope, parentTaskId, title)`
- `updateTaskFields(taskId, accountId, fields)` → `updateTaskFields(taskId, scope, fields)`
- `deleteKanbanTask(taskId, accountId)` → `deleteKanbanTask(taskId, scope)`
- `assignLabel(taskId, accountId, label.id)` → `assignLabel(taskId, scope, label.id)`
- `unassignLabel(taskId, accountId, labelId)` → `unassignLabel(taskId, scope, labelId)`
- `createLabel(accountId, name, color)` → `createLabel(scope, name, color)`
- `createKanbanTask(accountId, column, ...)` → `createKanbanTask(scope, column, ...)`

En los dos objetos `optimistic` (en `addSubtask` y `createTask`) cambiar `accountId,` por:
```ts
      accountId: scope.kind === "account" ? scope.accountId : null,
      projectId: scope.kind === "project" ? scope.projectId : null,
```
(El `KanbanTask` ahora tiene `projectId`. Confirmar que el objeto optimista lo incluye; si TS marca falta de `projectId`, agregarlo como arriba.)

Agregar el handler `moveScope` dentro del componente (junto a `deleteTask`):

```ts
  function moveScope(toScope: TaskScope): void {
    if (!selectedId) return;
    const id = selectedId;
    const prevTasks = tasks;
    // La tarea sale de este board (cambió de contenedor).
    setTasks((cur) => cur.filter((t) => t.id !== id && t.parentTaskId !== id));
    setSelectedId(null);
    moveTaskToScope(id, toScope)
      .then((res) => {
        if (res?.error) {
          setTasks(prevTasks);
          setError(res.error);
        }
      })
      .catch(() => {
        setTasks(prevTasks);
        setError("No se pudo mover la tarea de contenedor.");
      });
  }
```

En el `<TaskDrawer ...>` cambiar `accountId={accountId}` por `scope={scope}` y agregar:
```tsx
        moveTargets={moveTargets}
        onMoveScope={moveScope}
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run type-check`
Expected: los 3 componentes compilan. Quedan errores solo en `global-tasks-view.tsx` y en las páginas.

- [ ] **Step 5: Commit**

```bash
git add components/tareas/kanban-board.tsx components/tareas/task-drawer.tsx components/tareas/task-comments.tsx
git commit -m "feat(tareas): board/drawer/comments por TaskScope + mover de contenedor"
```

---

### Task 8: `GlobalTasksView` con contenedor

**Files:**
- Modify: `components/tareas/global-tasks-view.tsx`

- [ ] **Step 1: Adaptar props y tipos.**

Imports: agregar
```ts
import { scopeBoardPath } from "@/lib/tareas/scope";
```

Cambiar `GlobalTasksViewProps`:
```ts
interface GlobalTasksViewProps {
  tasks: GlobalTask[];
  containers: { kind: "account" | "project" | "loose"; id: string | null; name: string }[];
  members: WorkspaceMemberWithUser[];
}
```

En la firma del componente cambiar `accounts` por `containers`. Renombrar el estado `account`/`setAccount` a `container`/`setContainer` (filtro por contenedor; el value será `"account:<id>"`, `"project:<id>"` o `"loose"`).

- [ ] **Step 2: Actualizar filtro, búsqueda, sort, href y render.**

En `hasFilters` y `clearFilters`, cambiar `account` por `container`.

En `filtered`, reemplazar la búsqueda que usa `t.accountName` por `t.containerName`, y el filtro de cuenta:
```ts
      if (container) {
        const key =
          t.containerKind === "loose"
            ? "loose"
            : `${t.containerKind}:${t.containerId}`;
        if (key !== container) return false;
      }
```

En `sorted`, cambiar el caso `"account"` para ordenar por `a.containerName`/`b.containerName`. Renombrar la `SortKey` `"account"` a `"container"` (y su header).

`taskHref`:
```ts
  function taskHref(t: GlobalTask): string {
    const scope =
      t.containerKind === "account"
        ? ({ kind: "account", accountId: t.containerId as string } as const)
        : t.containerKind === "project"
        ? ({ kind: "project", projectId: t.containerId as string } as const)
        : ({ kind: "loose" } as const);
    return `${scopeBoardPath(scope)}?task=${t.id}`;
  }
```

En el `<select>` del filtro de contenedor (antes "Cuenta: todas"):
```tsx
          <select
            value={container}
            onChange={(e) => setContainer(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Contenedor: todos</option>
            {containers.map((c) => (
              <option
                key={c.kind === "loose" ? "loose" : `${c.kind}:${c.id}`}
                value={c.kind === "loose" ? "loose" : `${c.kind}:${c.id}`}
              >
                {c.name}
              </option>
            ))}
          </select>
```

En el render del tablero y la lista, cambiar `t.accountName` por `t.containerName` (la etiqueta de contenedor por tarjeta y la celda "Cuenta" → "Contenedor"). Cambiar el header de la columna de tabla `["account", "Cuenta"]` por `["container", "Contenedor"]`.

- [ ] **Step 3: Verificar tipos**

Run: `npm run type-check`
Expected: `global-tasks-view.tsx` compila. Quedan solo errores en las páginas (Milestone 6).

- [ ] **Step 4: Commit**

```bash
git add components/tareas/global-tasks-view.tsx
git commit -m "feat(tareas): vista global con contenedor (cuenta/proyecto/suelta)"
```

---

## Milestone 6 — Páginas y rutas

### Task 9: Página de board de cuenta (pasar scope) + componentes de proyecto

**Files:**
- Modify: `app/(protected)/app/tareas/[accountId]/page.tsx`
- Create: `components/tareas/project-board-header.tsx`
- Create: `components/tareas/new-project-dialog.tsx`

- [ ] **Step 1: Actualizar la página de cuenta para pasar `scope` + `moveTargets`.**

En `app/(protected)/app/tareas/[accountId]/page.tsx`, agregar imports:
```ts
import { getTaskAccessibleAccountIds, getAccessibleProjectIds } from "@/lib/queries/task-access";
import { getScopeMoveTargets } from "@/lib/queries/tareas";
```
(ya importa `canAccessAccountTasks`; agregar los otros.)

Después de cargar `account`, calcular los targets de mover:
```ts
  const [{ accountIds }, projectIds] = await Promise.all([
    getTaskAccessibleAccountIds(userId, workspace.id),
    getAccessibleProjectIds(userId, workspace.id),
  ]);
  const moveTargets = await getScopeMoveTargets(
    accountIds.filter((id) => id !== accountId),
    projectIds
  );
```

Cambiar el render del board:
```tsx
      <KanbanBoard
        scope={{ kind: "account", accountId }}
        currentUserId={userId}
        initialTasks={boardTasks}
        members={members}
        labels={labels}
        moveTargets={moveTargets}
      />
```

- [ ] **Step 2: Crear `components/tareas/new-project-dialog.tsx`** (dialog client de creación).

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { LABEL_COLORS, labelDotClass, type LabelColorKey } from "@/lib/tareas/labels";
import { createProject } from "@/app/actions/task-projects";

export function NewProjectDialog(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<LabelColorKey>(LABEL_COLORS[0].key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    createProject(name, color, description || null)
      .then((res) => {
        if (res.error || !res.id) {
          setError(res.error ?? "No se pudo crear el proyecto.");
          setBusy(false);
          return;
        }
        router.push(`/app/tareas/proyecto/${res.id}`);
      })
      .catch(() => {
        setError("No se pudo crear el proyecto.");
        setBusy(false);
      });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Plus size={15} /> Nuevo proyecto
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
          />
          <form
            onSubmit={submit}
            className="relative w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Nuevo proyecto</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nombre</label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Rediseño del sitio"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Descripción (opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setColor(c.key)}
                    aria-label={`Color ${c.key}`}
                    className={`h-6 w-6 rounded-full ${labelDotClass(c.key)} ${
                      c.key === color ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : ""
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Crear proyecto
            </button>
          </form>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Crear `components/tareas/project-board-header.tsx`** (nombre/color + miembros + archivar/borrar).

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Archive, Trash2, X, Plus } from "lucide-react";
import { labelDotClass } from "@/lib/tareas/labels";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import {
  addProjectMember,
  removeProjectMember,
  archiveProject,
  deleteProject,
} from "@/app/actions/task-projects";

interface ProjectBoardHeaderProps {
  projectId: string;
  name: string;
  color: string | null;
  createdBy: string | null;
  currentUserId: string;
  memberIds: string[];
  workspaceMembers: WorkspaceMemberWithUser[];
}

export function ProjectBoardHeader({
  projectId,
  name,
  color,
  createdBy,
  currentUserId,
  memberIds,
  workspaceMembers,
}: ProjectBoardHeaderProps): React.ReactElement {
  const router = useRouter();
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<string[]>(memberIds);
  const [error, setError] = useState<string | null>(null);
  const isCreator = createdBy === currentUserId;

  function add(userId: string): void {
    setMembers((cur) => [...new Set([...cur, userId])]);
    addProjectMember(projectId, userId).then((res) => {
      if (res.error) setError(res.error);
    });
  }
  function remove(userId: string): void {
    setMembers((cur) => cur.filter((id) => id !== userId));
    removeProjectMember(projectId, userId).then((res) => {
      if (res.error) {
        setError(res.error);
        setMembers((cur) => [...new Set([...cur, userId])]);
      }
    });
  }
  function archive(): void {
    if (!window.confirm("¿Archivar este proyecto? Se ocultará del índice.")) return;
    archiveProject(projectId, true).then((res) => {
      if (res.error) setError(res.error);
      else router.push("/app/tareas");
    });
  }
  function destroy(): void {
    if (!window.confirm("¿Borrar el proyecto y TODAS sus tareas? No se puede deshacer.")) return;
    deleteProject(projectId).then((res) => {
      if (res.error) setError(res.error);
      else router.push("/app/tareas");
    });
  }

  const available = workspaceMembers.filter((m) => !members.includes(m.userId));

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {color && <span className={`h-3 w-3 rounded-full ${labelDotClass(color)}`} />}
          <h1 className="text-2xl font-semibold">{name}</h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMembersOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Users size={13} /> Miembros · {members.length}
          </button>
          <button
            type="button"
            onClick={archive}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Archive size={13} /> Archivar
          </button>
          {isCreator && (
            <button
              type="button"
              onClick={destroy}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={13} /> Borrar
            </button>
          )}
        </div>
      </div>

      {membersOpen && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-1.5">
            {members.map((id) => {
              const m = workspaceMembers.find((mm) => mm.userId === id);
              const canRemove = id !== createdBy;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-background border border-border px-2 py-0.5 text-xs"
                >
                  {m?.displayName ?? "Usuario"}
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => remove(id)}
                      aria-label="Quitar miembro"
                      className="rounded-full hover:bg-foreground/10"
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          {available.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
              {available.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => add(m.userId)}
                  className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Plus size={11} /> {m.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run type-check`
Expected: la página de cuenta y los 2 componentes nuevos compilan. Quedan errores en la página índice (firma vieja de `getGlobalTasks`/`GlobalTasksView`) — siguiente task.

- [ ] **Step 5: Commit**

```bash
git add app/(protected)/app/tareas/[accountId]/page.tsx components/tareas/new-project-dialog.tsx components/tareas/project-board-header.tsx
git commit -m "feat(tareas): board de cuenta con scope + header/dialog de proyecto"
```

---

### Task 10: Rutas de proyecto y de tareas sueltas

**Files:**
- Create: `app/(protected)/app/tareas/proyecto/[projectId]/page.tsx`
- Create: `app/(protected)/app/tareas/mias/page.tsx`

- [ ] **Step 1: Crear `app/(protected)/app/tareas/proyecto/[projectId]/page.tsx`**

```tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import {
  canAccessProject,
  getTaskAccessibleAccountIds,
  getAccessibleProjectIds,
} from "@/lib/queries/task-access";
import {
  getProjectKanbanTasks,
  listWorkspaceTaskLabels,
  getScopeMoveTargets,
} from "@/lib/queries/tareas";
import { db } from "@/lib/drizzle/db";
import { taskProjects, taskProjectMembers } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { KanbanBoard } from "@/components/tareas/kanban-board";
import { ProjectBoardHeader } from "@/components/tareas/project-board-header";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function TareasProjectPage({ params }: PageProps) {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const { projectId } = await params;
  const allowed = await canAccessProject(userId, workspace.id, projectId);
  if (!allowed) redirect("/unauthorized");

  const [project] = await db
    .select({
      id: taskProjects.id,
      name: taskProjects.name,
      color: taskProjects.color,
      createdBy: taskProjects.createdBy,
    })
    .from(taskProjects)
    .where(and(eq(taskProjects.id, projectId), eq(taskProjects.workspaceId, workspace.id)))
    .limit(1);
  if (!project) notFound();

  const [boardTasks, members, labels, memberRows, { accountIds }, projectIds] =
    await Promise.all([
      getProjectKanbanTasks(projectId),
      getWorkspaceMembers(workspace.id),
      listWorkspaceTaskLabels(workspace.id),
      db
        .select({ userId: taskProjectMembers.userId })
        .from(taskProjectMembers)
        .where(eq(taskProjectMembers.projectId, projectId)),
      getTaskAccessibleAccountIds(userId, workspace.id),
      getAccessibleProjectIds(userId, workspace.id),
    ]);

  const moveTargets = await getScopeMoveTargets(
    accountIds,
    projectIds.filter((id) => id !== projectId)
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href="/app/tareas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={15} />
        Tareas
      </Link>
      <ProjectBoardHeader
        projectId={projectId}
        name={project.name}
        color={project.color}
        createdBy={project.createdBy}
        currentUserId={userId}
        memberIds={memberRows.map((m) => m.userId)}
        workspaceMembers={members}
      />
      <KanbanBoard
        scope={{ kind: "project", projectId }}
        currentUserId={userId}
        initialTasks={boardTasks}
        members={members}
        labels={labels}
        moveTargets={moveTargets}
      />
    </div>
  );
}
```

- [ ] **Step 2: Crear `app/(protected)/app/tareas/mias/page.tsx`**

```tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import {
  getTaskAccessibleAccountIds,
  getAccessibleProjectIds,
} from "@/lib/queries/task-access";
import {
  getLooseKanbanTasks,
  listWorkspaceTaskLabels,
  getScopeMoveTargets,
} from "@/lib/queries/tareas";
import { KanbanBoard } from "@/components/tareas/kanban-board";

export default async function TareasMiasPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [boardTasks, members, labels, { accountIds }, projectIds] =
    await Promise.all([
      getLooseKanbanTasks(userId, workspace.id),
      getWorkspaceMembers(workspace.id),
      listWorkspaceTaskLabels(workspace.id),
      getTaskAccessibleAccountIds(userId, workspace.id),
      getAccessibleProjectIds(userId, workspace.id),
    ]);

  const moveTargets = await getScopeMoveTargets(accountIds, projectIds);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href="/app/tareas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={15} />
        Tareas
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Mis tareas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tareas sueltas (no pertenecen a una cuenta ni proyecto).
        </p>
      </div>
      <KanbanBoard
        scope={{ kind: "loose" }}
        currentUserId={userId}
        initialTasks={boardTasks}
        members={members}
        labels={labels}
        moveTargets={moveTargets}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run type-check`
Expected: ambas páginas compilan. Resta la página índice.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/app/tareas/proyecto" "app/(protected)/app/tareas/mias"
git commit -m "feat(tareas): rutas de board de proyecto y de tareas sueltas"
```

---

### Task 11: Índice `/app/tareas` reorganizado

**Files:**
- Create: `components/tareas/tareas-index.tsx`
- Modify: `app/(protected)/app/tareas/page.tsx`

- [ ] **Step 1: Crear `components/tareas/tareas-index.tsx`** (accesos + grid de proyectos + dialog + vista global).

```tsx
"use client";

import Link from "next/link";
import { ListTodo, FolderKanban } from "lucide-react";
import { labelDotClass } from "@/lib/tareas/labels";
import { NewProjectDialog } from "./new-project-dialog";
import { GlobalTasksView } from "./global-tasks-view";
import type { GlobalTask, ProjectSummary } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface TareasIndexProps {
  projects: ProjectSummary[];
  looseCount: number;
  globalTasks: GlobalTask[];
  containers: { kind: "account" | "project" | "loose"; id: string | null; name: string }[];
  members: WorkspaceMemberWithUser[];
}

export function TareasIndex({
  projects,
  looseCount,
  globalTasks,
  containers,
  members,
}: TareasIndexProps): React.ReactElement {
  return (
    <div className="space-y-6">
      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/app/tareas/mias"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <ListTodo size={20} className="text-primary" />
          <div>
            <p className="text-sm font-semibold">Mis tareas</p>
            <p className="text-xs text-muted-foreground">{looseCount} sueltas</p>
          </div>
        </Link>
      </div>

      {/* Proyectos */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FolderKanban size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Proyectos</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/app/tareas/proyecto/${p.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              {p.color && <span className={`h-3 w-3 rounded-full ${labelDotClass(p.color)}`} />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.taskCount} {p.taskCount === 1 ? "tarea" : "tareas"}
                </p>
              </div>
            </Link>
          ))}
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border p-4">
            <NewProjectDialog />
          </div>
        </div>
      </div>

      {/* Vista global */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Todas las tareas</h2>
        <GlobalTasksView
          tasks={globalTasks}
          containers={containers}
          members={members}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir `app/(protected)/app/tareas/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import {
  getTaskAccessibleAccountIds,
  getAccessibleProjectIds,
} from "@/lib/queries/task-access";
import {
  getGlobalTasks,
  getUserProjects,
  getLooseKanbanTasks,
} from "@/lib/queries/tareas";
import { db } from "@/lib/drizzle/db";
import { accounts, taskProjects } from "@/lib/drizzle/schema";
import { inArray } from "drizzle-orm";
import { TareasIndex } from "@/components/tareas/tareas-index";

export default async function TareasIndexPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [{ accountIds }, projectIds] = await Promise.all([
    getTaskAccessibleAccountIds(userId, workspace.id),
    getAccessibleProjectIds(userId, workspace.id),
  ]);

  const [globalTasks, projects, looseTasks, members, accountRows, projectRows] =
    await Promise.all([
      getGlobalTasks({ userId, workspaceId: workspace.id, accountIds, projectIds }),
      getUserProjects(userId, workspace.id),
      getLooseKanbanTasks(userId, workspace.id),
      getWorkspaceMembers(workspace.id),
      accountIds.length > 0
        ? db
            .select({ id: accounts.id, name: accounts.name })
            .from(accounts)
            .where(inArray(accounts.id, accountIds))
            .orderBy(accounts.name)
        : Promise.resolve([]),
      projectIds.length > 0
        ? db
            .select({ id: taskProjects.id, name: taskProjects.name })
            .from(taskProjects)
            .where(inArray(taskProjects.id, projectIds))
            .orderBy(taskProjects.name)
        : Promise.resolve([]),
    ]);

  const containers: {
    kind: "account" | "project" | "loose";
    id: string | null;
    name: string;
  }[] = [
    ...accountRows.map((a) => ({ kind: "account" as const, id: a.id, name: a.name })),
    ...projectRows.map((p) => ({ kind: "project" as const, id: p.id, name: p.name })),
    { kind: "loose" as const, id: null, name: "Mis tareas" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tareas</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas, proyectos y tus tareas sueltas en un solo lugar.
        </p>
      </div>
      <TareasIndex
        projects={projects}
        looseCount={looseTasks.length}
        globalTasks={globalTasks}
        containers={containers}
        members={members}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run type-check`
Expected: PASS, sin errores en todo el repo.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build exitoso, con las rutas nuevas `/app/tareas/proyecto/[projectId]` y `/app/tareas/mias` listadas.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/app/tareas/page.tsx" components/tareas/tareas-index.tsx
git commit -m "feat(tareas): indice reorganizado (proyectos + mis tareas + global mezclada)"
```

---

## Milestone 7 — Verificación final

### Task 12: Compuerta + checklist manual

**Files:** ninguno (verificación).

- [ ] **Step 1: Type-check + build limpios**

Run: `npm run type-check && npm run build`
Expected: ambos PASS.

- [ ] **Step 2: Checklist manual en el navegador** (dev server `npm run dev` o Vercel). Marcar cada uno:
  - [ ] `/app/tareas`: se ven accesos "Mis tareas", grid de Proyectos con "Nuevo proyecto", y la vista global con filtro "Contenedor".
  - [ ] Crear un proyecto desde el dialog → redirige al board del proyecto.
  - [ ] En el board del proyecto: crear tarea, drag entre columnas, abrir drawer, comentar, etiquetar, subtarea.
  - [ ] Agregar un miembro al proyecto; con OTRO usuario (incl. un admin que NO sea miembro) confirmar que el proyecto NO aparece en su índice ni es accesible por URL (redirige a /unauthorized).
  - [ ] `/app/tareas/mias`: crear una tarea suelta; asignarla a otro usuario; confirmar que ese usuario la ve en SUS "Mis tareas" y un tercero no.
  - [ ] Drawer → "Contenedor": mover una tarea suelta a un proyecto (desaparece de Mis tareas y aparece en el proyecto); mover de proyecto a una cuenta; mover de cuenta a suelta.
  - [ ] Vista global: una tarea de cuenta, una de proyecto y una suelta aparecen con su etiqueta de contenedor; el filtro por contenedor funciona; los links abren el board correcto con el drawer (`?task=`).
  - [ ] Archivar el proyecto → desaparece del índice y del selector "Contenedor"; sus tareas no se borran (des-archivar vía DB o dejar archivado).
  - [ ] La vista pública de una cuenta sigue mostrando solo tareas públicas de cuenta (proyectos/sueltas nunca aparecen).

- [ ] **Step 3: Push**

```bash
git push
```

(Trigger.dev no se toca en este plan, así que no hace falta `trigger.dev deploy`.)

---

## Notas para el implementador

- **Orden estricto:** los Milestones dependen entre sí (schema → acceso → actions → queries → componentes → páginas). No saltear.
- **`type-check` parcial:** durante Milestones 3-5 es ESPERADO que `type-check` muestre errores en archivos aún no migrados (las páginas/componentes que todavía pasan `accountId`). Cada task aclara qué archivo debe quedar limpio. El árbol entero recién compila al final del Task 11.
- **Acceso por tarea, no por cliente:** nunca confíes en el `scope` que manda el cliente para autorizar operaciones sobre una tarea existente — `authorizeTask` lo deriva de la fila. El `scope` del cliente se usa solo para revalidar rutas y para crear.
- **Privacidad:** el guard de proyectos NO tiene bypass de admin a propósito (decisión del spec). No agregar `access.all` en `canAccessProject`/`getAccessibleProjectIds`.
- **`notifications.accountId`:** ya es nullable en el schema; las notificaciones de tareas de proyecto/sueltas guardan `accountId: null` sin problema.
```
