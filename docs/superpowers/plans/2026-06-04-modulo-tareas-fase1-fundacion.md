# Módulo de Tareas — Fase 1: Fundación (schema + acceso)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar el modelo de datos del módulo de Tareas (columnas nuevas en `tasks` + 5 tablas nuevas) y el helper de control de acceso por cuenta, sin romper el panel de tareas actual.

**Architecture:** Cambios **puramente aditivos**. Se extiende la tabla `tasks` con columnas de default seguro (`is_public=false`, `due_date=null`, `sort_order=0`) y se crean 5 tablas nuevas (`task_meeting_mentions`, `task_comments`, `task_comment_mentions`, `task_attachments`, `notifications`). NO se tocan los valores de `status` todavía (eso va en Fase 2, junto con el reemplazo del panel). Se agrega un helper `getTaskAccessibleAccountIds` que respeta owner/admin del workspace + owner/consultor de la cuenta.

**Tech Stack:** Drizzle ORM, PostgreSQL (Supabase), Next.js 15. Verificación con `npm run type-check`, `npm run db:status`, `npm run db:migrate` (no hay test runner en el repo).

**Nota de entorno:** dev y prod comparten una sola base de Supabase. El único comando de migración es `npm run db:migrate` (NO usar `db:migrate:prod`).

---

### Task 1: Extender la tabla `tasks` con las columnas nuevas

**Files:**
- Modify: `lib/drizzle/schema/tasks.ts`

- [ ] **Step 1: Agregar `boolean` y `date` a los imports de drizzle**

En `lib/drizzle/schema/tasks.ts`, reemplazar la línea 1:

```ts
import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
```

por:

```ts
import { pgTable, text, timestamp, uuid, integer, index, boolean, date } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Agregar las 3 columnas nuevas después de `priority`**

En el mismo archivo, después de la línea `priority: integer("priority").notNull().default(3),` agregar:

```ts
    isPublic: boolean("is_public").notNull().default(false),
    dueDate: date("due_date"),
    sortOrder: integer("sort_order").notNull().default(0),
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run type-check`
Expected: PASS (sin errores). Los tipos `Task`/`NewTask` ahora incluyen `isPublic`, `dueDate`, `sortOrder`.

---

### Task 2: Crear los 5 archivos de schema nuevos

**Files:**
- Create: `lib/drizzle/schema/task_meeting_mentions.ts`
- Create: `lib/drizzle/schema/task_comments.ts`
- Create: `lib/drizzle/schema/task_comment_mentions.ts`
- Create: `lib/drizzle/schema/task_attachments.ts`
- Create: `lib/drizzle/schema/notifications.ts`

- [ ] **Step 1: `task_meeting_mentions.ts`**

```ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { transcripts } from "./transcripts";

export const taskMeetingMentions = pgTable(
  "task_meeting_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    transcriptId: uuid("transcript_id").references(() => transcripts.id, {
      onDelete: "set null",
    }),
    sourceExcerpt: text("source_excerpt"),
    sourceContext: text("source_context"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("task_meeting_mentions_task_idx").on(table.taskId),
    index("task_meeting_mentions_transcript_idx").on(table.transcriptId),
  ]
);

export type TaskMeetingMention = typeof taskMeetingMentions.$inferSelect;
export type NewTaskMeetingMention = typeof taskMeetingMentions.$inferInsert;
```

- [ ] **Step 2: `task_comments.ts`**

```ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("task_comments_task_idx").on(table.taskId)]
);

export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
```

- [ ] **Step 3: `task_comment_mentions.ts`**

```ts
import { pgTable, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { taskComments } from "./task_comments";
import { users } from "./users";

export const taskCommentMentions = pgTable(
  "task_comment_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => taskComments.id, { onDelete: "cascade" }),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("task_comment_mentions_comment_idx").on(table.commentId),
    index("task_comment_mentions_user_idx").on(table.mentionedUserId),
  ]
);

export type TaskCommentMention = typeof taskCommentMentions.$inferSelect;
export type NewTaskCommentMention = typeof taskCommentMentions.$inferInsert;
```

- [ ] **Step 4: `task_attachments.ts`**

```ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { users } from "./users";

export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("task_attachments_task_idx").on(table.taskId)]
);

export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type NewTaskAttachment = typeof taskAttachments.$inferInsert;
```

- [ ] **Step 5: `notifications.ts`**

```ts
import { pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";
import { tasks } from "./tasks";
import { accounts } from "./accounts";
import { taskComments } from "./task_comments";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'mention' | 'assignment'
    type: text("type").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    commentId: uuid("comment_id").references(() => taskComments.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_unread_idx").on(table.userId, table.isRead),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
```

---

### Task 3: Exportar los schemas nuevos desde el índice

**Files:**
- Modify: `lib/drizzle/schema/index.ts`

- [ ] **Step 1: Agregar las 5 líneas al final de `index.ts`**

Al final del archivo (después de la línea `export * from "./billing_records";`) agregar:

```ts
export * from "./task_meeting_mentions";
export * from "./task_comments";
export * from "./task_comment_mentions";
export * from "./task_attachments";
export * from "./notifications";
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run type-check`
Expected: PASS. Todos los nuevos tipos exportados resuelven.

- [ ] **Step 3: Commit del schema**

```bash
git add lib/drizzle/schema/tasks.ts lib/drizzle/schema/task_meeting_mentions.ts lib/drizzle/schema/task_comments.ts lib/drizzle/schema/task_comment_mentions.ts lib/drizzle/schema/task_attachments.ts lib/drizzle/schema/notifications.ts lib/drizzle/schema/index.ts
git commit -m "feat(tareas): schema base — columnas de tasks + 5 tablas del módulo Kanban"
```

---

### Task 4: Generar y aplicar la migración

**Files:**
- Create: `drizzle/migrations/<NNNN>_<auto-name>/migration.sql` (autogenerado por drizzle-kit)
- Create: `drizzle/migrations/<NNNN>_<auto-name>/down.sql` (a mano)

- [ ] **Step 1: Generar la migración**

Run: `npm run db:generate`
Expected: crea una carpeta nueva en `drizzle/migrations/` (la siguiente después de `0034_rare_retro_girl`, ej. `0035_<algo>`). Imprime el SQL con `ALTER TABLE "tasks" ADD COLUMN ...` para las 3 columnas y `CREATE TABLE ...` para las 5 tablas nuevas.

- [ ] **Step 2: Identificar la carpeta generada**

Run: `git status --porcelain drizzle/migrations`
Expected: muestra la carpeta nueva (anotá el nombre exacto, ej. `0035_<algo>`). Llamala `<DIR>` en los pasos siguientes.

- [ ] **Step 3: Escribir el `down.sql`**

Crear `drizzle/migrations/<DIR>/down.sql` con exactamente:

```sql
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "is_public";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "due_date";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "sort_order";
DROP TABLE IF EXISTS "notifications";
DROP TABLE IF EXISTS "task_attachments";
DROP TABLE IF EXISTS "task_comment_mentions";
DROP TABLE IF EXISTS "task_comments";
DROP TABLE IF EXISTS "task_meeting_mentions";
```

(El orden de los `DROP TABLE` respeta las FKs: `notifications` y `task_comment_mentions` referencian `task_comments`, así que se borran antes.)

- [ ] **Step 4: Revisar el SQL generado**

Run: `npm run db:status`
Expected: lista la migración nueva como pendiente, sin errores de parseo.

- [ ] **Step 5: Aplicar la migración**

Run: `npm run db:migrate`
Expected: aplica la migración sin error. Las 5 tablas y las 3 columnas quedan creadas.

- [ ] **Step 6: Verificar que el app sigue compilando con la base nueva**

Run: `npm run build`
Expected: build exitoso. El panel de tareas actual sigue funcionando (los valores `status` siguen siendo `pending`/`completed`; no se tocaron).

- [ ] **Step 7: Commit de la migración**

```bash
git add drizzle/migrations
git commit -m "feat(tareas): migración — columnas tasks + tablas mentions/comments/attachments/notifications"
```

---

### Task 5: Helper de control de acceso por cuenta

**Files:**
- Create: `lib/queries/task-access.ts`

- [ ] **Step 1: Escribir el helper**

```ts
import { db } from "@/lib/drizzle/db";
import {
  accounts,
  accountConsultants,
  workspaceMembers,
} from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";

export interface TaskAccess {
  /** True si el usuario ve TODAS las cuentas del workspace (owner/admin). */
  all: boolean;
  /** IDs de cuentas accesibles (poblado en ambos casos). */
  accountIds: string[];
}

/**
 * Devuelve las cuentas cuyas tareas puede ver/editar el usuario.
 * - Owner/admin del workspace ⇒ todas las cuentas del workspace.
 * - Resto ⇒ solo cuentas que posee (`accounts.ownerId`) o donde es consultor
 *   (`account_consultants`).
 */
export async function getTaskAccessibleAccountIds(
  userId: string,
  workspaceId: string
): Promise<TaskAccess> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (member && (member.role === "owner" || member.role === "admin")) {
    const rows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.workspaceId, workspaceId));
    return { all: true, accountIds: rows.map((r) => r.id) };
  }

  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.workspaceId, workspaceId), eq(accounts.ownerId, userId))
    );

  const consulted = await db
    .select({ id: accountConsultants.accountId })
    .from(accountConsultants)
    .where(
      and(
        eq(accountConsultants.workspaceId, workspaceId),
        eq(accountConsultants.userId, userId)
      )
    );

  const ids = new Set<string>([
    ...owned.map((r) => r.id),
    ...consulted.map((r) => r.id),
  ]);
  return { all: false, accountIds: [...ids] };
}

/** Guard puntual: ¿el usuario puede acceder a las tareas de esta cuenta? */
export async function canAccessAccountTasks(
  userId: string,
  workspaceId: string,
  accountId: string
): Promise<boolean> {
  const { all, accountIds } = await getTaskAccessibleAccountIds(
    userId,
    workspaceId
  );
  return all || accountIds.includes(accountId);
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npm run type-check && npm run lint`
Expected: PASS (sin `any`, retornos explícitos, sin errores de lint).

- [ ] **Step 3: Verificación manual rápida (opcional pero recomendada)**

Crear un script temporal `scripts/_check-task-access.ts` que llame al helper con un `userId`/`workspaceId` reales de la base y loguee el resultado; correrlo con `npx tsx scripts/_check-task-access.ts`. Confirmar que un owner/admin recibe `all: true` y un member recibe solo sus cuentas. **Borrar el script después** (`git clean` no lo trackea si no se hizo `git add`).

- [ ] **Step 4: Commit del helper**

```bash
git add lib/queries/task-access.ts
git commit -m "feat(tareas): helper getTaskAccessibleAccountIds (acceso por cuenta)"
```

---

## Verificación final de la Fase 1

- [ ] `npm run type-check` → PASS
- [ ] `npm run lint` → PASS
- [ ] `npm run db:status` → la migración figura como aplicada
- [ ] `npm run build` → PASS
- [ ] El panel de tareas existente en el detalle de cuenta sigue funcionando igual (sin regresión)
- [ ] Push: `git push` (auto-push según preferencia del usuario)

## Qué NO incluye esta fase (va en fases siguientes)

- Backfill de `status` (`pending→backlog`, `completed→listas`) y check constraint → **Fase 2** (atómico con el reemplazo del panel).
- UI del Kanban, drag & drop (`@dnd-kit`) → **Fase 2**.
- Dedup en la extracción → **Fase 3**.
- Comentarios/menciones/adjuntos → **Fase 4**.
- Centro de notificaciones (campanita) → **Fase 5**.
- Vista global → **Fase 6**.
- Vista pública (Kanban de públicas) → **Fase 7**.
