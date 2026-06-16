# Invitados pre-asignables (placeholder users) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir asignar cuentas, tareas y demás a personas invitadas que todavía no se registraron; al registrarse, sus asignaciones se conservan y el email mostrado se reemplaza por su nombre.

**Architecture:** Al invitar se crea un **usuario placeholder** (fila real en `users` con `pending=true`, sin auth) más su fila en `workspace_members`, así es asignable con toda la maquinaria existente (`displayName = fullName ?? email`). Al registrarse, `ensureUserRecord` detecta el placeholder por email y lo **fusiona** con la cuenta real (re-apunta todas las FK→`users` al UID de auth y borra el placeholder).

**Tech Stack:** Next.js 15 server actions, Drizzle ORM (postgres-js), Supabase Auth, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-06-16-pending-invitees-assignable-design.md`

## Realidad de testing (leer antes de empezar)

- **No hay framework de tests** (ni vitest ni jest). La compuerta real del repo es `npm run type-check` + `npm run build` (ver `reference_tooling_quirks` en memoria).
- **Dev y prod comparten UNA base de Supabase.** NO escribir filas de prueba que queden persistidas. La verificación de base se hace con un script que corre dentro de una transacción y hace **ROLLBACK** (Task 9), o con el E2E manual del usuario.
- Por eso cada task cierra con `type-check` + `build` (no con "corré el test"), más verificación puntual donde aplica.

---

## File Structure

- `lib/drizzle/schema/users.ts` — agrega columna `pending`.
- `drizzle/migrations/0044_*/` — migración up + `down.sql` para `users.pending`.
- `lib/queries/workspace.ts` — `WorkspaceMemberWithUser.pending` + `getWorkspaceMembers` lo devuelve.
- `lib/workspace/merge-placeholder-user.ts` — **nuevo**: lista única de FK→`users` + `mergePlaceholderUser(tx, placeholderId, realId)` + `placeholderHasAssignments(userId)`.
- `app/actions/auth.ts` — `ensureUserRecord` hace el merge por email.
- `app/actions/workspace.ts` — `createWorkspaceInvite` crea placeholder + membership; `acceptWorkspaceInvite` idempotente; `revokeWorkspaceInvite` limpia placeholder sin asignaciones.
- `components/workspace-settings-client.tsx` — badge "Pendiente".
- `scripts/verify-merge-placeholder.ts` — **nuevo**: verificación con rollback (no persiste).

---

## Task 1: Migración — `users.pending`

**Files:**
- Modify: `lib/drizzle/schema/users.ts`
- Create: `drizzle/migrations/0044_*/down.sql` (el nombre lo genera drizzle)

- [ ] **Step 1: Agregar la columna al schema**

En `lib/drizzle/schema/users.ts`, agregar el import de `boolean` y la columna `pending`:

```ts
import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("member"),
  // true = placeholder creado por una invitación, sin cuenta de auth todavía.
  // Se vuelve false al fusionarse con la cuenta real en el registro.
  pending: boolean("pending").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 2: Generar la migración**

Run: `npm run db:generate`
Expected: crea `drizzle/migrations/0044_<nombre>.sql` con `ALTER TABLE "users" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;`

- [ ] **Step 3: Crear el down.sql**

Crear `drizzle/migrations/0044_<nombre>/down.sql` (mismo `<nombre>` que generó drizzle):

```sql
ALTER TABLE "users" DROP COLUMN IF EXISTS "pending";
```

- [ ] **Step 4: Aplicar la migración**

Run: `npm run db:migrate`
Expected: aplica 0044 sin error. (Las filas existentes quedan con `pending=false`, que es lo correcto: son usuarios reales.)

- [ ] **Step 5: Commit**

```bash
git add lib/drizzle/schema/users.ts drizzle/migrations
git commit -m "feat(users): columna pending para placeholders de invitados"
```

---

## Task 2: `getWorkspaceMembers` devuelve `pending`

**Files:**
- Modify: `lib/queries/workspace.ts:6-12` (type) y `:84-106` (query)

- [ ] **Step 1: Agregar `pending` al type**

En `lib/queries/workspace.ts`, en `WorkspaceMemberWithUser`:

```ts
export type WorkspaceMemberWithUser = {
  userId: string;
  role: string;
  displayName: string;
  email: string;
  financeAdmin: boolean;
  /** true si es un placeholder de invitación que aún no se registró. */
  pending: boolean;
};
```

- [ ] **Step 2: Seleccionar y mapear `pending` en `getWorkspaceMembers`**

Reemplazar el cuerpo de `getWorkspaceMembers`:

```ts
export async function getWorkspaceMembers(
  workspaceId: string
): Promise<WorkspaceMemberWithUser[]> {
  const rows = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      financeAdmin: workspaceMembers.financeAdmin,
      fullName: users.fullName,
      email: users.email,
      pending: users.pending,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return rows.map((r) => ({
    userId: r.userId,
    role: r.role,
    financeAdmin: r.financeAdmin,
    displayName: r.fullName ?? r.email,
    email: r.email,
    pending: r.pending,
  }));
}
```

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS (los consumidores de `WorkspaceMemberWithUser` que no usan `pending` siguen compilando; los que construían el objeto son solo esta query).

- [ ] **Step 4: Commit**

```bash
git add lib/queries/workspace.ts
git commit -m "feat(workspace): getWorkspaceMembers devuelve flag pending"
```

---

## Task 3: Helper de merge (`mergePlaceholderUser`) + lista de FK

**Files:**
- Create: `lib/workspace/merge-placeholder-user.ts`

Este es el corazón. Re-apunta TODAS las columnas FK→`users` del placeholder al usuario real y borra el placeholder. La lista está en un solo lugar (single source of truth). `workspace_members` se trata aparte por su unique `(workspace_id, user_id)`.

- [ ] **Step 1: Crear el archivo con la lista de FK y el merge**

Crear `lib/workspace/merge-placeholder-user.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";

/** Transacción de drizzle (mismo tipo que recibe el callback de `db.transaction`). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * TODAS las columnas FK→`users.id` del schema, EXCEPTO `workspace_members.user_id`
 * (se maneja aparte por su unique (workspace_id, user_id)). Si agregás una tabla
 * nueva con FK a users, sumá su (tabla, columna) acá: es el único lugar que el
 * merge necesita conocer. Nombres en snake_case tal como están en la base.
 */
const USER_FK_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ["accounts", "owner_id"],
  ["account_consultants", "user_id"],
  ["context_documents", "uploaded_by_user_id"],
  ["drive_connections", "connected_by_user_id"],
  ["fx_rates", "created_by_user_id"],
  ["finance_projection_assumptions", "updated_by_user_id"],
  ["member_compensation", "user_id"],
  ["meta_connections", "connected_by_user_id"],
  ["notifications", "user_id"],
  ["notifications", "actor_id"],
  ["selection_searches", "owner_id"],
  ["tasks", "created_by"],
  ["tasks", "assignee_id"],
  ["signals", "resolved_by"],
  ["task_attachments", "created_by"],
  ["task_comment_mentions", "user_id"],
  ["task_comments", "author_id"],
  ["task_project_members", "user_id"],
  ["task_projects", "created_by"],
  ["transcripts", "uploaded_by"],
  ["workspaces", "owner_id"],
  ["workspace_invites", "invited_by_user_id"],
  ["workspace_invites", "accepted_by_user_id"],
];

/**
 * Mueve todas las referencias de `placeholderId` a `realId` y borra el placeholder.
 * Corre dentro de la transacción `tx` provista por el llamador. No-op si ambos ids
 * son iguales.
 *
 * `workspace_members` primero: borramos las membresías del placeholder en los
 * workspaces donde el usuario real YA es miembro (evita violar el unique), y el
 * resto las re-apuntamos. Para las otras tablas con unique compuesto incluyendo
 * user_id (account_consultants, task_project_members, task_comment_mentions) el
 * UPDATE es seguro porque el usuario real recién registrado no tiene filas previas.
 */
export async function mergePlaceholderUser(
  tx: Tx,
  placeholderId: string,
  realId: string
): Promise<void> {
  if (placeholderId === realId) return;

  await tx.execute(sql`
    DELETE FROM workspace_members wm
    WHERE wm.user_id = ${placeholderId}
      AND EXISTS (
        SELECT 1 FROM workspace_members wm2
        WHERE wm2.workspace_id = wm.workspace_id AND wm2.user_id = ${realId}
      )
  `);
  await tx.execute(
    sql`UPDATE workspace_members SET user_id = ${realId} WHERE user_id = ${placeholderId}`
  );

  for (const [table, column] of USER_FK_COLUMNS) {
    await tx.execute(
      sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)} = ${realId} WHERE ${sql.identifier(column)} = ${placeholderId}`
    );
  }

  await tx.execute(sql`DELETE FROM users WHERE id = ${placeholderId}`);
}

/**
 * True si el placeholder está asignado a algo (cuenta como owner/consultor, tarea,
 * proyecto, o compensación). Son las únicas columnas que un admin puede asignar a
 * alguien que todavía no se registró; el resto requiere que el usuario haya actuado.
 */
export async function placeholderHasAssignments(userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 AS one WHERE
         EXISTS (SELECT 1 FROM accounts WHERE owner_id = ${userId})
      OR EXISTS (SELECT 1 FROM account_consultants WHERE user_id = ${userId})
      OR EXISTS (SELECT 1 FROM tasks WHERE assignee_id = ${userId})
      OR EXISTS (SELECT 1 FROM task_project_members WHERE user_id = ${userId})
      OR EXISTS (SELECT 1 FROM member_compensation WHERE user_id = ${userId})
    LIMIT 1
  `);
  // postgres-js devuelve un array de filas; hay match si trajo alguna.
  return Array.isArray(result) ? result.length > 0 : (result as { length: number }).length > 0;
}
```

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Si `sql.identifier` no existe en la versión de drizzle del repo, falla en type-check; en ese caso reemplazar la línea del loop por `sql.raw(\`UPDATE "${table}" SET "${column}" = \`)` concatenando un parámetro — los nombres vienen de la constante (no de input del usuario), así que es seguro. (Drizzle ≥0.29 tiene `sql.identifier`.)

- [ ] **Step 3: Commit**

```bash
git add lib/workspace/merge-placeholder-user.ts
git commit -m "feat(workspace): mergePlaceholderUser + lista unica de FK a users"
```

---

## Task 4: Merge en el registro (`ensureUserRecord`)

**Files:**
- Modify: `app/actions/auth.ts:9-22`

- [ ] **Step 1: Reescribir `ensureUserRecord` con detección de placeholder + merge**

En `app/actions/auth.ts`, actualizar imports y la función:

```ts
"use server";

import { db } from "@/lib/drizzle/db";
import {
  users,
  workspaces,
  workspaceMembers,
  workspaceInvites,
  usageTracking,
} from "@/lib/drizzle/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { mergePlaceholderUser } from "@/lib/workspace/merge-placeholder-user";
import { DEFAULT_WORKSPACE_SERVICES } from "@/lib/workspace/defaults";

export async function ensureUserRecord(
  userId: string,
  email: string
): Promise<void> {
  const lower = email.trim().toLowerCase();

  // ¿Hay un placeholder pendiente (creado por una invitación) para este email?
  const [placeholder] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.pending, true), sql`lower(${users.email}) = ${lower}`))
    .limit(1);

  if (placeholder && placeholder.id !== userId) {
    await db.transaction(async (tx) => {
      // 1. Liberar el email único que tiene el placeholder.
      await tx
        .update(users)
        .set({ email: `placeholder+${placeholder.id}@merge.local` })
        .where(eq(users.id, placeholder.id));
      // 2. Crear/asegurar la fila real con el UID de auth.
      await tx
        .insert(users)
        .values({ id: userId, email, pending: false })
        .onConflictDoUpdate({
          target: users.id,
          set: { email, pending: false, updatedAt: new Date() },
        });
      // 3. Mover todas las referencias del placeholder al usuario real y borrarlo.
      await mergePlaceholderUser(tx, placeholder.id, userId);
      // 4. Marcar la(s) invitación(es) pendientes de este email como aceptadas.
      await tx
        .update(workspaceInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(
          and(
            sql`lower(${workspaceInvites.email}) = ${lower}`,
            isNull(workspaceInvites.acceptedAt)
          )
        );
    });
    return;
  }

  // Sin placeholder → comportamiento original.
  await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, updatedAt: new Date() },
    });
}
```

(El resto del archivo, `createDefaultWorkspace`, queda igual: tras el merge el usuario ya es miembro del workspace del placeholder, así que `createDefaultWorkspace` no crea uno nuevo por su check `if (existing) return`.)

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/actions/auth.ts
git commit -m "feat(auth): fusionar placeholder de invitado al registrarse (por email)"
```

---

## Task 5: `createWorkspaceInvite` crea placeholder + membership

**Files:**
- Modify: `app/actions/workspace.ts:55-130`

El placeholder se crea SOLO si no existe ninguna fila `users` para ese email. El check de "ya es miembro" pasa a contar únicamente miembros **reales** (`pending=false`), para permitir re-invitar (la membresía del placeholder no debe bloquear).

- [ ] **Step 1: Importar `users.pending` ya está disponible; ajustar el check de miembro existente**

En `createWorkspaceInvite`, reemplazar el bloque "If the email is already a member" para excluir placeholders:

```ts
  // Si el email YA es miembro real (registrado) del workspace, rechazar.
  // Un placeholder pendiente no cuenta (permite re-invitar / re-generar link).
  const existingMember = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(users.email, normalizedEmail),
        eq(users.pending, false)
      )
    )
    .limit(1);
  if (existingMember.length > 0) {
    return { error: "Ese email ya forma parte del workspace" };
  }
```

- [ ] **Step 2: Crear/asegurar el placeholder + membership antes de crear el invite**

Insertar este bloque justo DESPUÉS del check anterior y ANTES de la lógica de dedup del invite (`const pending = ...`):

```ts
  // Placeholder asignable: si no existe ningún users para este email, crearlo
  // (pending=true) + su membership, así se le pueden cargar cuentas/tareas antes
  // de que se registre. Si ya existe un placeholder (re-invitación), asegurar la
  // membership y sincronizar el rol. Si existe un usuario REAL sin membership, no
  // tocamos nada (lo agrega el flujo de aceptar invitación).
  const [existingUser] = await db
    .select({ id: users.id, pending: users.pending })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!existingUser) {
    const [ph] = await db
      .insert(users)
      .values({ email: normalizedEmail, pending: true })
      .returning({ id: users.id });
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: ph.id,
      role,
    });
  } else if (existingUser.pending) {
    const [m] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.userId, existingUser.id)
        )
      )
      .limit(1);
    if (!m) {
      await db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: existingUser.id,
        role,
      });
    } else {
      await db
        .update(workspaceMembers)
        .set({ role })
        .where(eq(workspaceMembers.id, m.id));
    }
  }
```

(El bloque de dedup de invite y la creación del invite quedan igual.)

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/workspace.ts
git commit -m "feat(invites): crear usuario placeholder + membership al invitar"
```

---

## Task 6: `acceptWorkspaceInvite` idempotente

**Files:**
- Modify: `app/actions/workspace.ts:151-191`

Tras el merge, el usuario real ya es miembro del workspace del invite y el invite ya quedó `acceptedAt`. La página de aceptar invitación igual llama a `acceptWorkspaceInvite`: debe devolver éxito (no error "ya fue usada") cuando el usuario YA es miembro de ese workspace.

- [ ] **Step 1: Reordenar la lógica para que "ya es miembro" gane**

Reemplazar el cuerpo de `acceptWorkspaceInvite` desde `if (!invite)` hasta el final:

```ts
  if (!invite) return { error: "Invitación no encontrada o expirada" };

  const existing = await getWorkspaceByUserId(userId);

  // Si ya es miembro del workspace del invite (placeholder fusionado en el
  // registro, o re-click del link), éxito idempotente — incluso si ya está
  // marcado como aceptado.
  if (existing && existing.id === invite.workspaceId) {
    if (!invite.acceptedAt) {
      await db
        .update(workspaceInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(eq(workspaceInvites.id, invite.id));
    }
    return { workspaceId: existing.id };
  }

  if (invite.acceptedAt) return { error: "Esta invitación ya fue usada" };
  if (invite.expiresAt < new Date()) return { error: "La invitación expiró" };

  if (existing) {
    return {
      error:
        "Ya pertenecés a otro workspace. Cerrá sesión y registrate con otro email para aceptar.",
    };
  }

  // Caso sin merge previo (no había placeholder): alta normal.
  await db.insert(workspaceMembers).values({
    workspaceId: invite.workspaceId,
    userId,
    role: invite.role,
  });

  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date(), acceptedByUserId: userId })
    .where(eq(workspaceInvites.id, invite.id));

  revalidatePath("/app/portfolio");
  revalidatePath("/app/settings/workspace");
  return { workspaceId: invite.workspaceId };
```

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/actions/workspace.ts
git commit -m "fix(invites): acceptWorkspaceInvite idempotente cuando ya es miembro"
```

---

## Task 7: `revokeWorkspaceInvite` limpia placeholder sin asignaciones

**Files:**
- Modify: `app/actions/workspace.ts:132-149`

Al revocar: si el placeholder de ese email no está asignado a nada, borrar su membership (y el usuario si no le queda ninguna membership). Si tiene asignaciones, conservarlo como miembro pendiente y solo borrar el invite.

- [ ] **Step 1: Importar el helper y reescribir `revokeWorkspaceInvite`**

Agregar el import arriba de `app/actions/workspace.ts`:

```ts
import { placeholderHasAssignments } from "@/lib/workspace/merge-placeholder-user";
```

Reemplazar `revokeWorkspaceInvite`:

```ts
export async function revokeWorkspaceInvite(inviteId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const member = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(member?.role);

  // Cargar el invite (para conocer el email del placeholder) antes de borrarlo.
  const [invite] = await db
    .select({ email: workspaceInvites.email })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, workspace.id)
      )
    )
    .limit(1);

  await db
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, workspace.id)
      )
    );

  // Limpieza del placeholder si quedó sin asignaciones.
  if (invite) {
    const lower = invite.email.trim().toLowerCase();
    const [ph] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.pending, true), eq(users.email, lower)))
      .limit(1);
    if (ph && !(await placeholderHasAssignments(ph.id))) {
      await db
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, ph.id)
          )
        );
      const remaining = await db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, ph.id))
        .limit(1);
      if (remaining.length === 0) {
        await db.delete(users).where(eq(users.id, ph.id));
      }
    }
  }

  revalidatePath("/app/settings/workspace");
}
```

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/actions/workspace.ts
git commit -m "feat(invites): revoke limpia placeholder sin asignaciones"
```

---

## Task 8: Badge "Pendiente" en la lista de miembros

**Files:**
- Modify: `components/workspace-settings-client.tsx:125-133`

- [ ] **Step 1: Mostrar el badge cuando `m.pending`**

En el bloque que renderiza el nombre del miembro, agregar el badge:

```tsx
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.displayName}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                    )}
                    {m.pending && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        Pendiente
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
```

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/workspace-settings-client.tsx
git commit -m "feat(workspace): badge 'Pendiente' para miembros placeholder"
```

---

## Task 9: Verificación del merge (rollback) + E2E manual

**Files:**
- Create: `scripts/verify-merge-placeholder.ts`

El script crea datos de prueba (placeholder + asignaciones) DENTRO de una transacción, corre el merge, verifica que las FK quedaron re-apuntadas y el placeholder borrado, y hace **ROLLBACK** — no persiste nada en la base compartida.

- [ ] **Step 1: Escribir el script de verificación con rollback**

Crear `scripts/verify-merge-placeholder.ts`:

```ts
import { db } from "@/lib/drizzle/db";
import { sql } from "drizzle-orm";
import { mergePlaceholderUser } from "@/lib/workspace/merge-placeholder-user";

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;
  const check = (label: string, ok: boolean): void => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    ok ? passed++ : failed++;
  };

  try {
    await db.transaction(async (tx) => {
      // Tomar un workspace y un account reales para FKs válidas.
      const [ws] = (await tx.execute(
        sql`SELECT id FROM workspaces LIMIT 1`
      )) as unknown as Array<{ id: string }>;
      if (!ws) throw new Error("No hay workspaces en la base para la prueba");

      // Crear placeholder + usuario real de prueba.
      const [ph] = (await tx.execute(
        sql`INSERT INTO users (email, pending) VALUES ('ph-test@merge.local', true) RETURNING id`
      )) as unknown as Array<{ id: string }>;
      const [real] = (await tx.execute(
        sql`INSERT INTO users (email, pending) VALUES ('real-test@merge.local', false) RETURNING id`
      )) as unknown as Array<{ id: string }>;

      // Asignaciones del placeholder: membership + account owner + tarea.
      await tx.execute(
        sql`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${ws.id}, ${ph.id}, 'member')`
      );
      const [acct] = (await tx.execute(
        sql`INSERT INTO accounts (workspace_id, name, owner_id) VALUES (${ws.id}, 'merge-test-acct', ${ph.id}) RETURNING id`
      )) as unknown as Array<{ id: string }>;
      await tx.execute(
        sql`INSERT INTO tasks (workspace_id, account_id, title, assignee_id, status) VALUES (${ws.id}, ${acct.id}, 'merge-test-task', ${ph.id}, 'todo')`
      );

      // Merge.
      await mergePlaceholderUser(tx, ph.id, real.id);

      // Verificaciones.
      const owner = (await tx.execute(
        sql`SELECT owner_id FROM accounts WHERE id = ${acct.id}`
      )) as unknown as Array<{ owner_id: string }>;
      check("account.owner_id re-apuntado al real", owner[0]?.owner_id === real.id);

      const assignee = (await tx.execute(
        sql`SELECT assignee_id FROM tasks WHERE account_id = ${acct.id} AND title = 'merge-test-task'`
      )) as unknown as Array<{ assignee_id: string }>;
      check("task.assignee_id re-apuntado al real", assignee[0]?.assignee_id === real.id);

      const mem = (await tx.execute(
        sql`SELECT user_id FROM workspace_members WHERE workspace_id = ${ws.id} AND user_id = ${real.id}`
      )) as unknown as Array<{ user_id: string }>;
      check("workspace_members re-apuntado al real", mem.length === 1);

      const phGone = (await tx.execute(
        sql`SELECT id FROM users WHERE id = ${ph.id}`
      )) as unknown as Array<{ id: string }>;
      check("placeholder borrado", phGone.length === 0);

      // No persistir: abortar la transacción.
      throw new Error("__ROLLBACK__");
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__ROLLBACK__") {
      console.error("Error inesperado:", e);
      process.exitCode = 1;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed (cambios revertidos, nada persistido)`);
  if (failed > 0) process.exitCode = 1;
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end?.();
}

void main();
```

- [ ] **Step 2: Correr la verificación**

> NOTA: este script ESCRIBE (y revierte) en la base compartida. El modo auto del harness puede bloquear el `INSERT`/`DELETE`. Si lo bloquea, el usuario lo corre desde su terminal con `! npx dotenv -e .env.local -- tsx scripts/verify-merge-placeholder.ts`.

Run: `npx dotenv -e .env.local -- tsx scripts/verify-merge-placeholder.ts`
Expected: `4 passed, 0 failed (cambios revertidos, nada persistido)`

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-merge-placeholder.ts
git commit -m "test(workspace): verificacion del merge con rollback (no persiste)"
```

- [ ] **Step 4: E2E manual (lo corre el usuario en la app)**

Checklist a verificar en la app desplegada:

1. En Settings → Workspace, invitar `nuevo@ejemplo.com` (rol Member). Aparece en "Miembros" con su email y badge **Pendiente**.
2. Asignar a esa persona: como **consultor** de una cuenta, como **responsable** de una tarea, y (opcional) como **owner** de una cuenta. Debe poder seleccionarse en todos los dropdowns mostrando el email.
3. Abrir el link de invitación en una sesión nueva / incógnito y **registrarse** con ese email. Setear el nombre en Perfil.
4. Verificar: en "Miembros" ya NO tiene badge Pendiente y muestra el **nombre** (no el email). La cuenta y la tarea siguen asignadas a esa persona (ahora con su nombre).
5. Caso revoke: invitar otro email, NO asignarlo a nada, revocar la invitación → desaparece de Miembros y de Invitaciones pendientes.

---

## Self-Review

- **Spec coverage:**
  - `users.pending` → Task 1. ✓
  - createWorkspaceInvite crea placeholder + membership; dedup; check de miembro real → Task 5. ✓
  - revoke con/ sin asignaciones → Task 7. ✓
  - merge re-apuntando TODAS las FK en una función única → Task 3 + Task 4. ✓
  - reconciliar acceptWorkspaceInvite / "un workspace por usuario" → Task 6. ✓
  - UI badge "Pendiente" + getWorkspaceMembers devuelve pending → Task 2 + Task 8. ✓
  - Bordes (email ya real, signup normal por email, unique constraints) → cubiertos en Tasks 3/4/5. ✓
- **Placeholder scan:** sin TODO/TBD; todo el código está completo.
- **Type consistency:** `mergePlaceholderUser(tx, placeholderId, realId)` y `placeholderHasAssignments(userId)` se usan con esas firmas en Tasks 4 y 7. `WorkspaceMemberWithUser.pending` (Task 2) se consume en Task 8. `users.pending` (Task 1) se lee en Tasks 2/4/5/7.
- **Nota de despliegue:** ningún archivo bajo `trigger/tasks/*` cambia, así que no hace falta deploy de Trigger. Tras mergear: push (Vercel) + `db:migrate` ya corrido en Task 1 (dev y prod comparten base).
