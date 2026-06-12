# Integraciones: ownership + visibilidad (Meta + Drive) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que cada integración (Meta, Drive) sea visible/gestionable solo por quien la conectó + el owner del workspace, con Drive personal por usuario (+ compartido opcional) y una UI de Meta colapsable que no liste todos los ad accounts de una.

**Architecture:** Patrón de "ownership" sobre tablas que ya guardan `connectedByUserId`. Se aplica en dos capas: (1) queries de lectura filtran lo visible, (2) server actions revalidan autorización antes de mutar. Drive pasa de "uno por workspace" (índice único) a "uno por (workspace, usuario, scope)" con una columna `scope` nueva. La gestión de Drive se mueve de Ajustes→Workspace a la página de Integraciones para que todos los miembros puedan conectar el suyo.

**Tech Stack:** Next.js 15 (App Router, RSC + Server Actions), Drizzle ORM + Postgres (Supabase), Trigger.dev v3 (crons de sync), Tailwind.

**Compuerta de verificación (este repo NO tiene framework de test):** cada tarea cierra con `npm run type-check`; las tareas que tocan build de Next o migraciones agregan `npm run build` y/o `npm run db:migrate`. Verificación funcional = manual, descripta por tarea.

---

## Estructura de archivos

**Meta**
- Modificar: `app/actions/meta-connections.ts` — guard de autorización por conexión.
- Modificar: `app/(protected)/app/settings/integrations/page.tsx` — filtro de visibilidad + agrupar ad accounts por conexión.
- Crear: `components/meta-connection-card.tsx` — card colapsable por conexión.

**Drive**
- Modificar: `lib/drizzle/schema/drive_connections.ts` — columna `scope` + índice único nuevo.
- Modificar: `lib/drizzle/schema/accounts.ts` — columna `driveFolderConnectionId` (qué conexión bindeó la carpeta).
- Crear: `drizzle/migrations/<n>_*/down.sql` — down de la migración.
- Modificar: `lib/queries/drive.ts` — `getVisibleDriveConnections`, `resolveDriveConnectionForUser`.
- Modificar: `app/api/auth/google/login/route.ts` — pasar intención de scope por cookie.
- Modificar: `app/api/auth/google/callback/route.ts` — leer scope, validar permiso, upsert por (workspace,user,scope).
- Modificar: `app/actions/drive.ts` — acciones por `connectionId` + guard; per-account flows resuelven la conexión del usuario.
- Crear: `components/drive-connection-section.tsx` — sección por conexión (generaliza `workspace-drive-section.tsx`).
- Modificar: `app/(protected)/app/settings/integrations/page.tsx` — render de Drive por usuario.
- Modificar: `app/(protected)/app/settings/workspace/page.tsx` — sacar el bloque Drive de acá.
- Modificar: `trigger/tasks/sync-drive-folder-for-account.ts` — usar `driveFolderConnectionId`.
- Borrar (al final): `components/workspace-drive-section.tsx`.

---

## FASE 1 — Meta: autorización + visibilidad + UI colapsable

### Task 1: Guard de autorización en las server actions de Meta

**Files:**
- Modify: `app/actions/meta-connections.ts`

- [ ] **Step 1: Agregar helper de owner + guard de conexión**

Reemplazar `getWorkspaceOrFail` por estas dos funciones (mantené el resto de imports; agregá `getWorkspaceMember`):

```ts
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";

async function getWorkspaceAndOwner(
  userId: string
): Promise<{ workspaceId: string; isOwner: boolean }> {
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const member = await getWorkspaceMember(workspace.id, userId);
  return { workspaceId: workspace.id, isOwner: member?.role === "owner" };
}

/**
 * Carga la conexión y exige que el usuario sea su dueño o el owner del
 * workspace. Devuelve el workspaceId para reusar en revalidaciones.
 */
async function requireMetaConnectionAccess(
  connectionId: string,
  userId: string
): Promise<{ workspaceId: string }> {
  const { workspaceId, isOwner } = await getWorkspaceAndOwner(userId);
  const [conn] = await db
    .select({
      id: metaConnections.id,
      connectedByUserId: metaConnections.connectedByUserId,
    })
    .from(metaConnections)
    .where(
      and(
        eq(metaConnections.id, connectionId),
        eq(metaConnections.workspaceId, workspaceId)
      )
    )
    .limit(1);
  if (!conn) throw new Error("Conexión no encontrada");
  if (!isOwner && conn.connectedByUserId !== userId) {
    throw new Error("No tenés permisos sobre esta conexión");
  }
  return { workspaceId };
}

/**
 * Igual que el anterior pero resolviendo la conexión desde un ad account.
 */
async function requireAdAccountAccess(
  adAccountId: string,
  userId: string
): Promise<{ workspaceId: string }> {
  const { workspaceId, isOwner } = await getWorkspaceAndOwner(userId);
  const [ad] = await db
    .select({
      id: metaAdAccounts.id,
      connectedByUserId: metaConnections.connectedByUserId,
    })
    .from(metaAdAccounts)
    .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
    .where(
      and(
        eq(metaAdAccounts.id, adAccountId),
        eq(metaAdAccounts.workspaceId, workspaceId)
      )
    )
    .limit(1);
  if (!ad) throw new Error("Ad account no encontrado");
  if (!isOwner && ad.connectedByUserId !== userId) {
    throw new Error("No tenés permisos sobre este ad account");
  }
  return { workspaceId };
}
```

- [ ] **Step 2: Aplicar los guards en las tres acciones**

`disconnectMetaConnection`: reemplazar el cuerpo que usaba `getWorkspaceOrFail` por:

```ts
export async function disconnectMetaConnection(connectionId: string): Promise<void> {
  const userId = await requireUserId();
  await requireMetaConnectionAccess(connectionId, userId);
  await db.delete(metaConnections).where(eq(metaConnections.id, connectionId));
  revalidatePath("/app/settings/integrations");
}
```

`updateAdAccountMapping`: cambiar el preámbulo (las primeras dos líneas que obtienen workspace y validan el ad account) por:

```ts
  const userId = await requireUserId();
  const { workspaceId } = await requireAdAccountAccess(input.adAccountId, userId);
```

y borrar el bloque `const ad = await db.select(...).limit(1); if (ad.length === 0) ...` que ya no hace falta para autorizar — PERO seguís necesitando `previousAccountId`. Sustituilo por una lectura puntual del `accountId` actual:

```ts
  const [adRow] = await db
    .select({ currentAccountId: metaAdAccounts.accountId })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, input.adAccountId))
    .limit(1);
  const previousAccountId = adRow?.currentAccountId ?? null;
```

(El resto de la función queda igual; `workspace.id` se reemplaza por `workspaceId` donde aparezca.)

`triggerBackfillForAdAccount`: reemplazar preámbulo por:

```ts
export async function triggerBackfillForAdAccount(adAccountId: string): Promise<void> {
  const userId = await requireUserId();
  await requireAdAccountAccess(adAccountId, userId);
  const { tasks } = await import("@trigger.dev/sdk/v3");
  await tasks.trigger("backfill-meta-ads", { adAccountId });
}
```

- [ ] **Step 3: type-check**

Run: `npm run type-check`
Expected: PASS (sin errores). Si marca `getWorkspaceOrFail` sin usar, borralo.

- [ ] **Step 4: Commit**

```bash
git add app/actions/meta-connections.ts
git commit -m "feat(meta): autorizar acciones de Meta por dueño u owner"
```

---

### Task 2: Filtro de visibilidad en la página de Integraciones (Meta)

**Files:**
- Modify: `app/(protected)/app/settings/integrations/page.tsx`

- [ ] **Step 1: Calcular owner y filtrar conexiones + ad accounts**

Reemplazar el bloque `const [connections, adAccounts, planiAccounts, crmRows] = await Promise.all([...])` por la versión con visibilidad. Importá `getWorkspaceMember` y `inArray`, `and` de drizzle:

```ts
import { eq, and, inArray } from "drizzle-orm";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
```

```ts
  const member = await getWorkspaceMember(workspace.id, userId);
  const isOwner = member?.role === "owner";

  const allConnections = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspace.id));

  // Visibles: las propias + (si owner) todas.
  const connections = allConnections.filter(
    (c) => isOwner || c.connectedByUserId === userId
  );
  const visibleConnIds = connections.map((c) => c.id);

  const [adAccounts, planiAccounts, crmRows] = await Promise.all([
    visibleConnIds.length > 0
      ? db
          .select()
          .from(metaAdAccounts)
          .where(
            and(
              eq(metaAdAccounts.workspaceId, workspace.id),
              inArray(metaAdAccounts.connectionId, visibleConnIds)
            )
          )
      : Promise.resolve([]),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.workspaceId, workspace.id)),
    db
      .select({ /* ...igual que hoy... */ })
      .from(crmConnections)
      .innerJoin(accounts, eq(crmConnections.accountId, accounts.id))
      .where(eq(crmConnections.workspaceId, workspace.id)),
  ]);
```

(Mantené el `select` de `crmRows` exactamente como está hoy — solo se movió fuera del primer Promise.all.)

- [ ] **Step 2: Agrupar ad accounts por conexión y preparar nombres de dueños**

Antes del `return`, armá la estructura agrupada (la consume el componente de la Task 3). Para los nombres de dueño, traé los miembros:

```ts
import { getWorkspaceMembers } from "@/lib/queries/workspace";
```

```ts
  const membersList = isOwner ? await getWorkspaceMembers(workspace.id) : [];
  const nameByUserId = new Map(membersList.map((m) => [m.userId, m.displayName]));

  const adAccountsByConnection = new Map<string, typeof adAccounts>();
  for (const aa of adAccounts) {
    const list = adAccountsByConnection.get(aa.connectionId) ?? [];
    list.push(aa);
    adAccountsByConnection.set(aa.connectionId, list);
  }
```

- [ ] **Step 3: type-check**

Run: `npm run type-check`
Expected: PASS. (La UI todavía usa la lista vieja — la cambiamos en Task 3. Si hay error por `adAccounts` sin usar en el JSX viejo, dejá el JSX viejo por ahora; se reemplaza en Task 3.)

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/app/settings/integrations/page.tsx"
git commit -m "feat(meta): filtrar conexiones y ad accounts por visibilidad"
```

---

### Task 3: Card colapsable por conexión de Meta

**Files:**
- Create: `components/meta-connection-card.tsx`
- Modify: `app/(protected)/app/settings/integrations/page.tsx`

- [ ] **Step 1: Crear el componente colapsable**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, BarChart3 } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { AdAccountMappingForm } from "@/components/ad-account-mapping-form";
import { BackfillButton } from "@/components/backfill-button";
import { disconnectMetaConnection } from "@/app/actions/meta-connections";

export interface MetaAdAccountView {
  id: string;
  accountId: string | null;
  metaAdAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  isEcommerce: boolean;
  conversionEvent: string;
  lastSyncedAt: Date | null;
}

interface Props {
  connectionId: string;
  metaLabel: string;
  status: string;
  tokenExpiresAt: Date | null;
  ownerName: string | null; // solo lo pasa el owner; null = no mostrar "conectado por"
  adAccounts: MetaAdAccountView[];
  planiAccounts: Array<{ id: string; name: string }>;
}

export function MetaConnectionCard({
  connectionId,
  metaLabel,
  status,
  tokenExpiresAt,
  ownerName,
  adAccounts,
  planiAccounts,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <BarChart3 size={15} className="text-primary shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium truncate">{metaLabel}</span>
            <span className="block text-xs text-muted-foreground">
              {adAccounts.length} ad account{adAccounts.length === 1 ? "" : "s"}
              {" · "}Estado: {status}
              {tokenExpiresAt && (
                <> · Expira {new Date(tokenExpiresAt).toLocaleDateString("es-AR")}</>
              )}
              {ownerName && <> · conectado por {ownerName}</>}
            </span>
          </span>
        </button>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/api/auth/meta/login"
            className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
          >
            Reconectar
          </Link>
          <DeleteButton
            action={async () => {
              "use server";
              await disconnectMetaConnection(connectionId);
            }}
            confirmMessage="¿Desconectar Meta? Se eliminarán todos los ad accounts vinculados."
            className="inline-flex items-center rounded-md border border-destructive/30 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/10 transition-colors"
          >
            Desconectar
          </DeleteButton>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {adAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta conexión no tiene ad accounts sincronizados todavía.
            </p>
          ) : (
            adAccounts.map((aa) => (
              <div
                key={aa.id}
                className="rounded-lg p-3 space-y-2 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">{aa.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {aa.metaAdAccountId} · {aa.currency} · {aa.timezone}
                      {aa.lastSyncedAt && (
                        <> · última sync {new Date(aa.lastSyncedAt).toLocaleString("es-AR")}</>
                      )}
                    </p>
                  </div>
                  {aa.accountId && <BackfillButton adAccountId={aa.id} />}
                </div>
                <AdAccountMappingForm
                  adAccountId={aa.id}
                  currentAccountId={aa.accountId}
                  currentIsEcommerce={aa.isEcommerce}
                  currentConversionEvent={aa.conversionEvent}
                  planiAccounts={planiAccounts}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reemplazar en la page la sección "Ad accounts disponibles" por las cards**

En `integrations/page.tsx`, borrá el bloque `{adAccounts.length > 0 && (...)}` completo (la sección "Ad accounts disponibles"). Dentro del bloque de Meta, donde hoy se mapean `connections.map((c) => <div...>)`, reemplazá ese `.map` por:

```tsx
            {connections.map((c) => (
              <MetaConnectionCard
                key={c.id}
                connectionId={c.id}
                metaLabel={c.metaUserName ?? c.metaUserId}
                status={c.status}
                tokenExpiresAt={c.tokenExpiresAt}
                ownerName={isOwner ? nameByUserId.get(c.connectedByUserId ?? "") ?? null : null}
                adAccounts={adAccountsByConnection.get(c.id) ?? []}
                planiAccounts={planiAccounts}
              />
            ))}
```

Importá el componente arriba: `import { MetaConnectionCard } from "@/components/meta-connection-card";`

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Si `build` se queja de tipos serializables en props, confirmá que solo pasás datos planos (sí — strings, números, Date, arrays).

- [ ] **Step 4: Verificación manual**

Levantá `npm run dev`, entrá a `/app/settings/integrations`:
- Como member con una Meta conectada: ves solo tu card, colapsada; al expandir aparecen tus ad accounts; no ves la de otro.
- Como owner: ves una card por cada conexión, con "conectado por {nombre}".

- [ ] **Step 5: Commit**

```bash
git add components/meta-connection-card.tsx "app/(protected)/app/settings/integrations/page.tsx"
git commit -m "feat(meta): cards colapsables por conexion (mata el listado plano)"
```

---

## FASE 2 — Drive: schema + migración

### Task 4: Columnas `scope` y `driveFolderConnectionId` + índice único nuevo

**Files:**
- Modify: `lib/drizzle/schema/drive_connections.ts`
- Modify: `lib/drizzle/schema/accounts.ts`
- Create: `drizzle/migrations/<n>_*/down.sql`

- [ ] **Step 1: Editar el schema de drive_connections**

Reemplazar el bloque de la tabla por (cambios: import de `check`, columna `scope`, índice único nuevo):

```ts
import { pgTable, text, timestamp, uuid, uniqueIndex, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const driveConnections = pgTable(
  "drive_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    scope: text("scope").notNull().default("personal"),
    googleAccountEmail: text("google_account_email"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at"),
    folderId: text("folder_id"),
    folderName: text("folder_name"),
    linkOnlySync: boolean("link_only_sync").notNull().default(false),
    status: text("status"),
    lastSyncAt: timestamp("last_sync_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("drive_connections_ws_user_scope_unique").on(
      table.workspaceId,
      table.connectedByUserId,
      table.scope
    ),
    check("drive_connections_scope_check", sql`${table.scope} IN ('personal','workspace')`),
  ]
);

export type DriveConnection = typeof driveConnections.$inferSelect;
export type NewDriveConnection = typeof driveConnections.$inferInsert;
```

- [ ] **Step 2: Agregar columna a accounts**

En `lib/drizzle/schema/accounts.ts`, agregá junto a las columnas `driveFolder*` existentes:

```ts
  driveFolderConnectionId: uuid("drive_folder_connection_id"),
```

(Sin FK explícita para evitar ciclos de import; es un puntero blando a `drive_connections.id`. Si el codebase ya importa `driveConnections` en accounts, podés agregar `.references(() => driveConnections.id, { onDelete: "set null" })`.)

- [ ] **Step 3: Generar la migración**

Run: `npm run db:generate`
Expected: crea `drizzle/migrations/<n>_<slug>.sql` con: `ALTER TABLE drive_connections ADD COLUMN scope ...`, `DROP INDEX drive_connections_workspace_unique`, `CREATE UNIQUE INDEX drive_connections_ws_user_scope_unique ...`, `ALTER TABLE accounts ADD COLUMN drive_folder_connection_id ...`, y el check constraint.

- [ ] **Step 4: Escribir el down.sql**

Crear `drizzle/migrations/<n>_<slug>/down.sql` (misma carpeta `<n>_<slug>` que genera drizzle) revirtiendo en orden inverso:

```sql
DROP INDEX IF EXISTS "drive_connections_ws_user_scope_unique";
ALTER TABLE "drive_connections" DROP CONSTRAINT IF EXISTS "drive_connections_scope_check";
ALTER TABLE "drive_connections" DROP COLUMN IF EXISTS "scope";
CREATE UNIQUE INDEX IF NOT EXISTS "drive_connections_workspace_unique" ON "drive_connections" ("workspace_id");
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "drive_folder_connection_id";
```

- [ ] **Step 5: Migrar**

Run: `npm run db:migrate`
Expected: "Migrations complete". (Recordá: dev y prod comparten la misma base — esta migración ya cubre prod.)

- [ ] **Step 6: type-check + commit**

Run: `npm run type-check`
Expected: PASS.

```bash
git add lib/drizzle/schema/drive_connections.ts lib/drizzle/schema/accounts.ts drizzle/migrations
git commit -m "feat(drive): scope por usuario + driveFolderConnectionId (schema + migracion)"
```

---

## FASE 3 — Drive: queries, OAuth, acciones

### Task 5: Queries de visibilidad y resolución de conexión

**Files:**
- Modify: `lib/queries/drive.ts`

- [ ] **Step 1: Reemplazar el contenido del archivo**

```ts
import { db } from "@/lib/drizzle/db";
import { driveConnections } from "@/lib/drizzle/schema";
import { and, eq, or } from "drizzle-orm";
import type { DriveConnection } from "@/lib/drizzle/schema/drive_connections";

export type { DriveConnection };

/**
 * Conexiones de Drive visibles para un usuario:
 *  - las personales propias (connectedByUserId == userId)
 *  - todas las del workspace con scope 'workspace' (compartidas)
 *  - si es owner, todas.
 */
export async function getVisibleDriveConnections(
  workspaceId: string,
  userId: string,
  isOwner: boolean
): Promise<DriveConnection[]> {
  const all = await db
    .select()
    .from(driveConnections)
    .where(eq(driveConnections.workspaceId, workspaceId));
  if (isOwner) return all;
  return all.filter(
    (c) => c.connectedByUserId === userId || c.scope === "workspace"
  );
}

/**
 * La conexión que usa un usuario para operaciones por-cuenta (pegar link,
 * bindear carpeta): su personal; si no tiene, una compartida del workspace.
 */
export async function resolveDriveConnectionForUser(
  workspaceId: string,
  userId: string
): Promise<DriveConnection | null> {
  const [personal] = await db
    .select()
    .from(driveConnections)
    .where(
      and(
        eq(driveConnections.workspaceId, workspaceId),
        eq(driveConnections.connectedByUserId, userId),
        eq(driveConnections.scope, "personal")
      )
    )
    .limit(1);
  if (personal) return personal;

  const [shared] = await db
    .select()
    .from(driveConnections)
    .where(
      and(
        eq(driveConnections.workspaceId, workspaceId),
        eq(driveConnections.scope, "workspace")
      )
    )
    .limit(1);
  return shared ?? null;
}

/** Carga una conexión por id (sin chequear permiso — el caller lo hace). */
export async function getDriveConnectionById(
  id: string
): Promise<DriveConnection | null> {
  const [row] = await db
    .select()
    .from(driveConnections)
    .where(eq(driveConnections.id, id))
    .limit(1);
  return row ?? null;
}
```

Nota: se elimina `getDriveConnectionForWorkspace`. La Task 8 y 10 actualizan sus callers. (Mantené `or` importado solo si lo usás; si no, quitalo para no romper lint.)

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: FALLA en los callers de `getDriveConnectionForWorkspace` (workspace page, drive actions, import-drive-link). Es esperado — se arreglan en Tasks 6-8 y 10. Anotá los archivos que lista el error para no olvidarte ninguno.

- [ ] **Step 3: Commit (parcial, compila al final de la fase)**

```bash
git add lib/queries/drive.ts
git commit -m "feat(drive): queries de visibilidad y resolucion de conexion por usuario"
```

---

### Task 6: OAuth — pasar y guardar el scope (personal/workspace)

**Files:**
- Modify: `app/api/auth/google/login/route.ts`
- Modify: `app/api/auth/google/callback/route.ts`

- [ ] **Step 1: login — aceptar `scope` y guardarlo en cookie**

En `login/route.ts`, agregá una constante y guardá el scope pedido (default `personal`; `workspace` solo si owner/admin — la validación dura está en el callback, acá solo lo registramos):

```ts
const SCOPE_COOKIE = "google_oauth_drive_scope";
```

Después de setear el `STATE_COOKIE`, agregá:

```ts
  const requestedScope =
    req.nextUrl.searchParams.get("scope") === "workspace" ? "workspace" : "personal";
  cookieStore.set(SCOPE_COOKIE, requestedScope, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
```

- [ ] **Step 2: callback — leer scope, validar permiso, upsert por (workspace,user,scope)**

En `callback/route.ts`:

a) Agregá la constante `const SCOPE_COOKIE = "google_oauth_drive_scope";` y la lectura/borrado del cookie (cerca de donde se leen los otros cookies):

```ts
  const requestedScope =
    cookieStore.get(SCOPE_COOKIE)?.value === "workspace" ? "workspace" : "personal";
  cookieStore.delete(SCOPE_COOKIE);
```

b) **Quitar** el gate global `if (!member || (member.role !== "owner" && member.role !== "admin")) return redirect("forbidden", ...)` que hoy bloquea a los members — ahora cualquier member puede conectar su Drive personal. Reemplazarlo por: members pueden `personal`; solo owner/admin pueden `workspace`:

```ts
  const canManageWorkspaceScope =
    member?.role === "owner" || member?.role === "admin";
  const scope = requestedScope === "workspace" && canManageWorkspaceScope
    ? "workspace"
    : "personal";
```

c) Reemplazar el bloque de upsert (`existing` por `workspaceId`) por upsert por la nueva clave:

```ts
    const existing = await db
      .select({ id: driveConnections.id })
      .from(driveConnections)
      .where(
        and(
          eq(driveConnections.workspaceId, workspace.id),
          eq(driveConnections.connectedByUserId, userId),
          eq(driveConnections.scope, scope)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(driveConnections)
        .set({
          googleAccountEmail: userInfo.email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: tokenExpiryDate(tokens),
          status: "connected",
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(driveConnections.id, existing[0].id));
    } else {
      await db.insert(driveConnections).values({
        workspaceId: workspace.id,
        connectedByUserId: userId,
        scope,
        googleAccountEmail: userInfo.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokenExpiryDate(tokens),
        status: "connected",
      });
    }
```

Importá `and` de drizzle en el callback (hoy solo importa `eq`).

d) Cambiar `DEFAULT_REDIRECT_BASE` a `/app/settings/integrations` (ahí vive ahora la UI de Drive).

- [ ] **Step 3: type-check**

Run: `npm run type-check`
Expected: el archivo callback compila (sigue fallando lo de Task 5 en otros archivos). OK seguir.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/google/login/route.ts app/api/auth/google/callback/route.ts
git commit -m "feat(drive): OAuth conecta Drive personal (members) o compartido (owner/admin)"
```

---

### Task 7: Acciones de Drive por `connectionId` + guard

**Files:**
- Modify: `app/actions/drive.ts`

- [ ] **Step 1: Helper de autorización por conexión**

Reemplazar `ensureManager` por un guard por conexión (y mantener un helper de workspace para los flows por-cuenta):

```ts
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import {
  getDriveConnectionById,
  resolveDriveConnectionForUser,
} from "@/lib/queries/drive";

async function requireDriveConnectionAccess(
  connectionId: string
): Promise<{ connectionId: string; userId: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const conn = await getDriveConnectionById(connectionId);
  if (!conn || conn.workspaceId !== workspace.id) {
    throw new Error("Conexión no encontrada");
  }
  const member = await getWorkspaceMember(workspace.id, userId);
  const isOwner = member?.role === "owner";
  const isManager = isOwner || member?.role === "admin";
  // Personal: dueño u owner. Compartida (workspace): owner/admin.
  const allowed =
    conn.scope === "workspace" ? isManager : conn.connectedByUserId === userId || isOwner;
  if (!allowed) throw new Error("No tenés permisos sobre esta conexión");
  return { connectionId, userId };
}
```

- [ ] **Step 2: Reescribir las 5 acciones de gestión para recibir `connectionId`**

```ts
export async function listDriveFoldersForConnection(
  connectionId: string,
  search?: string
): Promise<{ folders?: DriveFolder[]; error?: string }> {
  try {
    await requireDriveConnectionAccess(connectionId);
    const accessToken = await ensureFreshAccessToken(connectionId);
    const folders = await listDriveFolders(accessToken, search);
    return { folders };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo listar carpetas" };
  }
}

export async function setDriveLinkOnlySync(
  connectionId: string,
  enabled: boolean
): Promise<{ error?: string }> {
  try {
    await requireDriveConnectionAccess(connectionId);
    await db
      .update(driveConnections)
      .set({ linkOnlySync: enabled, updatedAt: new Date() })
      .where(eq(driveConnections.id, connectionId));
    revalidatePath("/app/settings/integrations");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" };
  }
}

export async function setDriveFolder(
  connectionId: string,
  folderId: string,
  folderName: string
): Promise<{ error?: string }> {
  try {
    await requireDriveConnectionAccess(connectionId);
    await db
      .update(driveConnections)
      .set({ folderId, folderName, lastError: null, updatedAt: new Date() })
      .where(eq(driveConnections.id, connectionId));
    revalidatePath("/app/settings/integrations");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" };
  }
}

export async function disconnectDrive(connectionId: string): Promise<void> {
  await requireDriveConnectionAccess(connectionId);
  await db.delete(driveConnections).where(eq(driveConnections.id, connectionId));
  revalidatePath("/app/settings/integrations");
}

export async function syncDriveNow(
  connectionId: string
): Promise<{ runId?: string; error?: string }> {
  try {
    await requireDriveConnectionAccess(connectionId);
    const conn = await getDriveConnectionById(connectionId);
    if (!conn) return { error: "Drive no está conectado" };
    if (!conn.folderId) return { error: "Configurá una carpeta primero" };
    const { tasks } = await import("@trigger.dev/sdk/v3");
    const handle = await tasks.trigger("sync-drive-folder", { connectionId });
    return { runId: handle.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo disparar el sync" };
  }
}
```

- [ ] **Step 3: Arreglar los flows por-cuenta para usar la conexión del usuario**

En `importDriveLinkForAccount`: reemplazar las dos lecturas de conexión por `workspaceId` (`hasConn` y `conn`) por una sola resolución vía `resolveDriveConnectionForUser(workspace.id, userId)`. Donde hoy hace `if (!hasConn) return { outcome: "drive_not_connected" }` y luego usa `conn.id` para `ensureFreshAccessToken`, queda:

```ts
  const conn = await resolveDriveConnectionForUser(workspace.id, userId);
  if (!conn) return { outcome: "drive_not_connected" };
  // ...más abajo, donde usaba conn.id:
  accessToken = await ensureFreshAccessToken(conn.id);
```

En `bindFolderInternal`: agregar `userId` ya lo recibe; reemplazar la lectura `conn` por `resolveDriveConnectionForUser(workspaceId, userId)`; y al persistir el binding en `accounts`, **guardar también** `driveFolderConnectionId: conn.id`:

```ts
  const conn = await resolveDriveConnectionForUser(workspaceId, userId);
  if (!conn) {
    return { outcome: "folder_bound", folderName: "",
      error: "Conectá Google Drive primero desde Integraciones para vincular carpetas." };
  }
  // ...
  await db.update(accounts).set({
    driveFolderId: folderId,
    driveFolderName: folderName,
    driveFolderMatchAccountName: matchAccountName,
    driveFolderConnectionId: conn.id,
    updatedAt: new Date(),
  }).where(eq(accounts.id, accountId));
```

En `unlinkDriveFolderForAccount`: agregar `driveFolderConnectionId: null` al `.set({...})`.

- [ ] **Step 4: type-check**

Run: `npm run type-check`
Expected: PASS para `app/actions/drive.ts` (los componentes que llaman a estas acciones se actualizan en Task 8). Si falla por `WorkspaceDriveSection` aún usando firmas viejas, OK — se reemplaza en Task 8.

- [ ] **Step 5: Commit**

```bash
git add app/actions/drive.ts
git commit -m "feat(drive): acciones por connectionId con guard; flows por-cuenta usan la conexion del usuario"
```

---

## FASE 4 — Drive: UI en Integraciones + cron

### Task 8: Componente `DriveConnectionSection` + render en Integraciones

**Files:**
- Create: `components/drive-connection-section.tsx`
- Modify: `app/(protected)/app/settings/integrations/page.tsx`

- [ ] **Step 1: Crear el componente (generaliza workspace-drive-section)**

Es el mismo UI que `components/workspace-drive-section.tsx` pero: (a) recibe `connection: DriveConnection` (ya existente, no nullable — el "conectar" lo maneja la page con CTAs), (b) todas las acciones reciben `connection.id` como primer argumento, (c) usa `listDriveFoldersForConnection` en vez de `...ForWorkspace`. Copiá `workspace-drive-section.tsx` a `drive-connection-section.tsx` y aplicá estos cambios:

- Props: `interface Props { connection: DriveConnection; canManage: boolean; }` (sacá `isConfigured`, `driveSuccess`, `driveError` — eso lo muestra la page).
- `fetchFolders`: `await listDriveFoldersForConnection(connection.id, query)`.
- `handlePickFolder`: `await setDriveFolder(connection.id, folder.id, folder.name)`.
- `handleDisconnect`: `await disconnectDrive(connection.id)`.
- `handleSyncNow`: `await syncDriveNow(connection.id)`.
- checkbox linkOnly: `await setDriveLinkOnlySync(connection.id, next)`.
- Header: mostrar un badge con `connection.scope === "workspace" ? "Compartido" : "Personal"` y, si `scope==='workspace'`, el email; envolvé los botones de gestión en `{canManage && (...)}` (para compartidas, canManage = owner/admin; para personales, la page solo renderiza la sección al dueño/owner así que canManage=true).
- Importá los actions desde `@/app/actions/drive` y `DriveConnection` desde `@/lib/queries/drive`.

(El resto del JSX — picker de carpetas, estados, textos — queda igual.)

- [ ] **Step 2: Render en la page de Integraciones**

En `integrations/page.tsx`, agregá la data de Drive al data-fetching (después de calcular `isOwner`):

```ts
import { getVisibleDriveConnections } from "@/lib/queries/drive";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { DriveConnectionSection } from "@/components/drive-connection-section";
```

```ts
  const driveConnections = await getVisibleDriveConnections(workspace.id, userId, isOwner);
  const myPersonal = driveConnections.find(
    (c) => c.connectedByUserId === userId && c.scope === "personal"
  );
  const canManageShared = member?.role === "owner" || member?.role === "admin";
  const driveConfigured = isGoogleOAuthConfigured();
```

Agregá una `<section>` nueva de Drive (después de Meta, antes o después de CRM), con:
- Si `driveConfigured` es false: el mensaje de "no configurado" (copiá el de `workspace-drive-section.tsx`).
- CTA "Conectar mi Drive" → `href="/api/auth/google/login?returnTo=/app/settings/integrations"` si el usuario no tiene `myPersonal`.
- CTA "Conectar Drive compartido del workspace" → `href="/api/auth/google/login?scope=workspace&returnTo=/app/settings/integrations"` solo si `canManageShared`.
- Mensajes de éxito/error desde `searchParams` (`drive`, `drive_error`) — extendé el tipo de `searchParams` a `{ connected?: string; error?: string; drive?: string; drive_error?: string }`.
- Una `<DriveConnectionSection>` por cada conexión en `driveConnections`, pasando `canManage` = (es dueño || isOwner) para personales, (canManageShared) para `scope==='workspace'`.

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Verificación manual**

`/app/settings/integrations`:
- Member sin Drive: ve "Conectar mi Drive". Tras conectar, ve su sección personal y puede elegir carpeta + sync.
- Otro member no ve el Drive del primero.
- Owner ve todos los Drives; admin ve los suyos + compartidos.
- Owner/admin ve "Conectar Drive compartido"; al conectarlo, aparece para todos.

- [ ] **Step 5: Commit**

```bash
git add components/drive-connection-section.tsx "app/(protected)/app/settings/integrations/page.tsx"
git commit -m "feat(drive): gestion de Drive por usuario en Integraciones (+ compartido)"
```

---

### Task 9: Sacar el bloque Drive de Ajustes→Workspace

**Files:**
- Modify: `app/(protected)/app/settings/workspace/page.tsx`
- Delete: `components/workspace-drive-section.tsx`

- [ ] **Step 1: Quitar Drive de la página de Workspace**

En `workspace/page.tsx`: borrar el import de `WorkspaceDriveSection`, `getDriveConnectionForWorkspace`, `isGoogleOAuthConfigured` (si no se usan en otro lado de la page), el fetch de `driveConnection` del `Promise.all`, y el `<WorkspaceDriveSection .../>` del JSX. Ajustar el tipo de `searchParams` si ya no usa `drive`/`drive_error` (dejalo si querés ser conservador — no molesta).

- [ ] **Step 2: Borrar el componente viejo**

```bash
git rm components/workspace-drive-section.tsx
```

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Si algo más importaba `getDriveConnectionForWorkspace`, el type-check lo marca — migralo a `getVisibleDriveConnections`/`resolveDriveConnectionForUser`.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/app/settings/workspace/page.tsx"
git commit -m "refactor(drive): mover gestion de Drive de Workspace a Integraciones"
```

---

### Task 10: Cron por-cuenta usa la conexión correcta

**Files:**
- Modify: `trigger/tasks/sync-drive-folder-for-account.ts`

- [ ] **Step 1: Resolver la conexión por `driveFolderConnectionId`**

En `sync-drive-folder-for-account.ts`, traé `driveFolderConnectionId` en el `select` de `acc` y reemplazá la lectura de `conn` (hoy `.where(workspaceId).limit(1)`) por: usar la conexión bindeada; si no hay, fallback a cualquier conexión del workspace (compat):

```ts
      .select({
        id: accounts.id,
        name: accounts.name,
        driveFolderId: accounts.driveFolderId,
        driveFolderName: accounts.driveFolderName,
        driveFolderMatchAccountName: accounts.driveFolderMatchAccountName,
        driveFolderConnectionId: accounts.driveFolderConnectionId,
      })
```

```ts
    let conn = acc.driveFolderConnectionId
      ? (await db.select().from(driveConnections)
          .where(eq(driveConnections.id, acc.driveFolderConnectionId)).limit(1))[0]
      : undefined;
    if (!conn) {
      [conn] = await db.select().from(driveConnections)
        .where(eq(driveConnections.workspaceId, payload.workspaceId)).limit(1);
    }
    if (!conn) {
      logger.warn("No Drive connection for account folder — skip", {
        workspaceId: payload.workspaceId, accountId: payload.accountId });
      return;
    }
```

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Deploy del worker (Trigger.dev)**

> Importante (memoria del proyecto): los workers de Trigger.dev **no** se redeployan con git push automáticamente salvo por el workflow `trigger-deploy.yml` en push a master. Como esto va en una rama, el cambio del cron recién corre en prod tras mergear a master (que dispara el deploy) o corriendo `npx trigger.dev@latest deploy` manualmente.

- [ ] **Step 4: Commit**

```bash
git add trigger/tasks/sync-drive-folder-for-account.ts
git commit -m "fix(drive): sync por-cuenta usa la conexion que bindeo la carpeta"
```

---

## Cierre

- [ ] **Verificación final:** `npm run type-check && npm run build` en verde.
- [ ] **Grep de seguridad:** `getDriveConnectionForWorkspace` no debe quedar referenciado en ningún lado (`grep -rn getDriveConnectionForWorkspace`).
- [ ] **Merge + push:** mergear `feat/integraciones-ownership` a master y push (dispara Vercel + trigger-deploy). Avisar al user qué probar (los 4 escenarios de verificación manual de Tasks 3 y 8).

## Notas de decisiones (del spec)

- Matching de import (Drive personal) sigue contra **todas** las cuentas del workspace. Acotar a "mis cuentas" se evalúa con #6.
- Métricas de Meta en páginas de cliente **no se tocan** (siguen visibles para todos con acceso a la cuenta).
- "Quién ve todo" = solo el **Owner**. Admins gestionan el Drive compartido pero no ven integraciones personales ajenas.
