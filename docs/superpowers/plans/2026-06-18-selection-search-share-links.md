# Links individuales por búsqueda + búsquedas confidenciales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir compartir una búsqueda de Selección con su propio link público, y marcar búsquedas como confidenciales para que no aparezcan en el link general del cliente.

**Architecture:** Tabla nueva `selection_search_share_links` (espejo de `account_share_links`, por `searchId`) + ruta pública `/cs/[token]` que reusa el password gate, la cookie y la `SelectionSection` interactiva. Un flag `confidential` en `selection_searches` filtra esas búsquedas del portal de cuenta. Las acciones públicas del cliente resuelven ambos tipos de token.

**Tech Stack:** Next.js 15 (App Router) server actions/components, Drizzle ORM (postgres-js), Supabase, bcryptjs (hash de contraseña), Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-18-selection-search-share-links-design.md`

## Global Constraints

- Sin framework de tests: la compuerta real del repo es `npm run type-check` + `npm run build` (ver `reference_tooling_quirks`). Cada task cierra con eso.
- Dev y prod comparten UNA base de Supabase; no escribir filas de prueba persistentes. Cada migración lleva su `down.sql` ANTES de `db:migrate`.
- TypeScript strict: sin `any`, sin `@ts-expect-error`, return types explícitos en funciones exportadas, sin estilos inline (usar Tailwind), `next/image` para imágenes.
- Server actions devuelven objetos planos; `redirect` fuera de try/catch.
- La confidencialidad SOLO afecta el portal público de cuenta (`/c/[token]`); la app interna sigue mostrando todas las búsquedas. El link individual (`/cs/[token]`) muestra la búsqueda aunque sea confidencial.

---

## File Structure

- `lib/drizzle/schema/selection_searches.ts` — agrega columna `confidential`.
- `lib/drizzle/schema/selection_search_share_links.ts` — **nuevo**: tabla del link por búsqueda.
- `lib/drizzle/schema/index.ts` (o el barrel donde se re-exportan los schemas) — exportar el schema nuevo.
- `drizzle/migrations/00XX_*` — `confidential` + tabla (+ `down.sql`).
- `lib/queries/selection-public.ts` — **nuevo**: proyección de candidato pública compartida (`loadCandidatesForSearches`).
- `lib/queries/public-account.ts` — usa el helper compartido + filtra `confidential=false`.
- `lib/queries/public-search.ts` — **nuevo**: `getPublicSearchSnapshot(token)`.
- `app/actions/selection.ts` — `setSearchConfidential` + acciones del link de búsqueda.
- `app/actions/selection-client.ts` — resolver de token extendido (`resolvePublicToken`).
- `app/(public)/cs/[token]/page.tsx` — **nuevo**: página pública de una búsqueda.
- `app/(public)/cs/[token]/password-gate.tsx` — **nuevo**: clon del gate (o reusar el de `/c`).
- `components/public-search-view.tsx` — **nuevo**: branding + `SelectionSection` de una búsqueda.
- `components/selection/search-share-section.tsx` — **nuevo**: UI interna para compartir la búsqueda.
- `components/selection/search-list.tsx` (o donde se gestiona la búsqueda) — toggle confidencial + montaje de `SearchShareSection`.

---

## Task 1: Migración — `confidential` + tabla `selection_search_share_links`

**Files:**
- Modify: `lib/drizzle/schema/selection_searches.ts`
- Create: `lib/drizzle/schema/selection_search_share_links.ts`
- Modify: el barrel de schemas (donde se exportan las tablas; buscar `export * from "./account_share_links"` o equivalente)
- Create: `drizzle/migrations/00XX_<nombre>/down.sql`

- [ ] **Step 1: Agregar `confidential` al schema de búsquedas**

En `lib/drizzle/schema/selection_searches.ts`, importar `boolean` y agregar la columna (después de `status`):

```ts
import { pgTable, text, timestamp, uuid, index, boolean } from "drizzle-orm/pg-core";
// ...
    status: text("status").notNull().default("active"),
    // true = no se muestra en el link público general de la cuenta. La agencia la
    // sigue viendo en la app; se comparte por su link individual.
    confidential: boolean("confidential").notNull().default(false),
```

- [ ] **Step 2: Crear el schema de la tabla de links**

Crear `lib/drizzle/schema/selection_search_share_links.ts`:

```ts
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { selectionSearches } from "./selection_searches";

export const selectionSearchShareLinks = pgTable(
  "selection_search_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    searchId: uuid("search_id")
      .notNull()
      .references(() => selectionSearches.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    passwordHash: text("password_hash"),
    passwordVersion: integer("password_version").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    viewCount: integer("view_count").notNull().default(0),
    lastAccessedAt: timestamp("last_accessed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("selection_search_share_links_search_idx").on(table.searchId)]
);

export type SelectionSearchShareLink = typeof selectionSearchShareLinks.$inferSelect;
export type NewSelectionSearchShareLink = typeof selectionSearchShareLinks.$inferInsert;
```

- [ ] **Step 3: Exportar el schema nuevo en el barrel**

Buscar el archivo que re-exporta los schemas (p.ej. `lib/drizzle/schema/index.ts`, que ya tiene una línea `export * from "./account_share_links";`). Agregar:

```ts
export * from "./selection_search_share_links";
```

(Si los schemas se importan individualmente en `lib/drizzle/db.ts` en vez de un barrel, agregar la tabla a ese objeto de schema también — seguir el patrón existente de `account_share_links`.)

- [ ] **Step 4: Generar la migración**

Run: `npm run db:generate`
Expected: crea `drizzle/migrations/00XX_<nombre>.sql` con `ALTER TABLE "selection_searches" ADD COLUMN "confidential" boolean DEFAULT false NOT NULL;` y `CREATE TABLE "selection_search_share_links" (...)` con su FK e índice.

- [ ] **Step 5: Crear el `down.sql`**

Crear `drizzle/migrations/00XX_<nombre>/down.sql` (mismo `<nombre>` que generó drizzle):

```sql
DROP TABLE IF EXISTS "selection_search_share_links";
ALTER TABLE "selection_searches" DROP COLUMN IF EXISTS "confidential";
```

- [ ] **Step 6: type-check + build**

Run: `npm run type-check; if ($?) { npm run build }`
Expected: PASS.

- [ ] **Step 7: Aplicar la migración**

Run: `npm run db:migrate`
Expected: aplica sin error. (Filas existentes quedan con `confidential=false`.)

- [ ] **Step 8: Commit**

```bash
git add lib/drizzle/schema drizzle/migrations
git commit -m "feat(seleccion): schema confidential + tabla selection_search_share_links"
```

---

## Task 2: Filtro de confidenciales en el portal de cuenta + toggle interno

**Files:**
- Modify: `lib/queries/public-account.ts` (`loadSelectionForAccount`)
- Modify: `app/actions/selection.ts` (nueva action `setSearchConfidential`)
- Modify: `components/selection/search-list.tsx` (toggle + badge)

**Interfaces:**
- Produces: `setSearchConfidential({ accountId, searchId, confidential }): Promise<ActionResult>`

- [ ] **Step 1: Filtrar confidenciales del portal de cuenta**

En `lib/queries/public-account.ts`, dentro de `loadSelectionForAccount`, el query de `selectionSearches` hoy filtra `status='active'`. Agregar el filtro de confidencial. Reemplazar el `.where(...)` de ese select por:

```ts
    .where(
      and(
        eq(selectionSearches.accountId, accountId),
        eq(selectionSearches.status, "active"),
        eq(selectionSearches.confidential, false)
      )
    )
```

(`and`, `eq` ya están importados en el archivo.)

- [ ] **Step 2: Action para togglear confidencial**

En `app/actions/selection.ts`, agregar (usa `requireAccountInWorkspace`, `selectionSearches`, `and`, `eq`, `revalidatePath` ya importados):

```ts
export async function setSearchConfidential(input: {
  accountId: string;
  searchId: string;
  confidential: boolean;
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    await db
      .update(selectionSearches)
      .set({ confidential: input.confidential, updatedAt: new Date() })
      .where(
        and(
          eq(selectionSearches.id, input.searchId),
          eq(selectionSearches.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection`);
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
```

Verificar que `selectionSearches` esté importado en `selection.ts`; si no, agregarlo al import de `@/lib/drizzle/schema`.

- [ ] **Step 3: Toggle + badge en la lista de búsquedas**

En `components/selection/search-list.tsx` (componente cliente que lista las búsquedas de una cuenta), por cada búsqueda agregar un toggle "Confidencial" y un badge cuando está activo. La búsqueda ya trae sus campos; agregar `confidential` al tipo de props si la lista tipa las búsquedas explícitamente (seguir el tipo existente que viene de la query de búsquedas; incluir `confidential` en ese select si no estaba).

Patrón del toggle (usa `useTransition` + `useRouter`, como el resto del componente):

```tsx
<button
  type="button"
  onClick={() =>
    startTransition(async () => {
      await setSearchConfidential({
        accountId,
        searchId: s.id,
        confidential: !s.confidential,
      });
      router.refresh();
    })
  }
  disabled={isPending}
  className={
    s.confidential
      ? "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 disabled:opacity-50"
      : "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 [--tw-ring-color:var(--glass-border)] hover:text-foreground disabled:opacity-50"
  }
  title="Si está activo, esta búsqueda NO aparece en el link general del cliente"
>
  {s.confidential ? "Confidencial" : "Marcar confidencial"}
</button>
```

Importar `setSearchConfidential` desde `@/app/actions/selection`. Asegurar que la query que alimenta `search-list` incluya `confidential` (buscar el select de búsquedas en `lib/queries/selection.ts` o el page que pasa las búsquedas, y agregar `confidential: selectionSearches.confidential`).

- [ ] **Step 4: type-check + build**

Run: `npm run type-check; if ($?) { npm run build }`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/public-account.ts app/actions/selection.ts components/selection/search-list.tsx lib/queries/selection.ts
git commit -m "feat(seleccion): busquedas confidenciales (toggle + filtro del portal de cuenta)"
```

---

## Task 3: Acciones del link por búsqueda

**Files:**
- Modify: `app/actions/selection.ts`

**Interfaces:**
- Produces:
  - `createSearchShareLink(input: { accountId: string; searchId: string }): Promise<{ success: boolean; error?: string; token?: string }>`
  - `setSearchShareActive(input: { accountId: string; searchId: string; isActive: boolean }): Promise<ActionResult>`
  - `setSearchSharePassword(input: { accountId: string; searchId: string; password: string | null }): Promise<ActionResult>`
  - `getSearchShareLink(input: { accountId: string; searchId: string }): Promise<{ token: string | null; isActive: boolean; hasPassword: boolean; viewCount: number }>`

- [ ] **Step 1: Imports**

En `app/actions/selection.ts`, agregar al import de schema `selectionSearchShareLinks` y a los imports de libs:

```ts
import { generateShareToken } from "@/lib/share/token";
import { hashSharePassword } from "@/lib/share/password";
```

- [ ] **Step 2: Helper de autorización por búsqueda**

Agregar (resuelve la búsqueda → su accountId y valida que esté en el workspace del caller, reusando `requireAccountInWorkspace`):

```ts
async function requireSearchInWorkspace(searchId: string): Promise<{
  workspaceId: string;
  accountId: string;
}> {
  const [s] = await db
    .select({ accountId: selectionSearches.accountId })
    .from(selectionSearches)
    .where(eq(selectionSearches.id, searchId))
    .limit(1);
  if (!s) throw new Error("Búsqueda no encontrada");
  const workspaceId = await requireAccountInWorkspace(s.accountId);
  return { workspaceId, accountId: s.accountId };
}
```

- [ ] **Step 3: Crear/obtener el link (idempotente)**

```ts
export async function createSearchShareLink(input: {
  accountId: string;
  searchId: string;
}): Promise<{ success: boolean; error?: string; token?: string }> {
  try {
    await requireSearchInWorkspace(input.searchId);
    const [existing] = await db
      .select({ token: selectionSearchShareLinks.token })
      .from(selectionSearchShareLinks)
      .where(eq(selectionSearchShareLinks.searchId, input.searchId))
      .limit(1);
    if (existing) {
      revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
      return { success: true, token: existing.token };
    }
    const token = generateShareToken();
    await db
      .insert(selectionSearchShareLinks)
      .values({ searchId: input.searchId, token });
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true, token };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
```

- [ ] **Step 4: Activar/desactivar**

```ts
export async function setSearchShareActive(input: {
  accountId: string;
  searchId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  try {
    await requireSearchInWorkspace(input.searchId);
    await db
      .update(selectionSearchShareLinks)
      .set({ isActive: input.isActive, updatedAt: new Date() })
      .where(eq(selectionSearchShareLinks.searchId, input.searchId));
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
```

- [ ] **Step 5: Setear/quitar contraseña (bumpea passwordVersion)**

```ts
export async function setSearchSharePassword(input: {
  accountId: string;
  searchId: string;
  password: string | null;
}): Promise<ActionResult> {
  try {
    await requireSearchInWorkspace(input.searchId);
    const [link] = await db
      .select({ passwordVersion: selectionSearchShareLinks.passwordVersion })
      .from(selectionSearchShareLinks)
      .where(eq(selectionSearchShareLinks.searchId, input.searchId))
      .limit(1);
    if (!link) return { success: false, error: "No hay link para esta búsqueda" };
    const passwordHash =
      input.password && input.password.trim().length > 0
        ? await hashSharePassword(input.password)
        : null;
    await db
      .update(selectionSearchShareLinks)
      .set({
        passwordHash,
        passwordVersion: link.passwordVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(selectionSearchShareLinks.searchId, input.searchId));
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
```

- [ ] **Step 6: Estado del link para la UI**

```ts
export async function getSearchShareLink(input: {
  accountId: string;
  searchId: string;
}): Promise<{ token: string | null; isActive: boolean; hasPassword: boolean; viewCount: number }> {
  await requireSearchInWorkspace(input.searchId);
  const [link] = await db
    .select({
      token: selectionSearchShareLinks.token,
      isActive: selectionSearchShareLinks.isActive,
      passwordHash: selectionSearchShareLinks.passwordHash,
      viewCount: selectionSearchShareLinks.viewCount,
    })
    .from(selectionSearchShareLinks)
    .where(eq(selectionSearchShareLinks.searchId, input.searchId))
    .limit(1);
  if (!link) return { token: null, isActive: false, hasPassword: false, viewCount: 0 };
  return {
    token: link.token,
    isActive: link.isActive,
    hasPassword: !!link.passwordHash,
    viewCount: link.viewCount,
  };
}
```

- [ ] **Step 7: type-check + build**

Run: `npm run type-check; if ($?) { npm run build }`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/actions/selection.ts
git commit -m "feat(seleccion): acciones del link publico por busqueda"
```

---

## Task 4: Proyección de candidato compartida + loader público de la búsqueda

**Files:**
- Create: `lib/queries/selection-public.ts`
- Modify: `lib/queries/public-account.ts` (usar el helper en `loadSelectionForAccount`)
- Create: `lib/queries/public-search.ts`

**Interfaces:**
- Produces:
  - `loadCandidatesForSearch(searchId: string): Promise<PublicCandidate[]>`
  - `type PublicCandidate` (la forma que hoy arma `loadSelectionForAccount`)
  - `getPublicSearchSnapshot(token): Promise<PublicSearchLookup>`

- [ ] **Step 1: Extraer la proyección de candidato a un helper compartido**

Crear `lib/queries/selection-public.ts`. Copiar EXACTAMENTE la lista de columnas y el `.map(...)` que hoy arma los candidatos dentro de `loadSelectionForAccount` (`lib/queries/public-account.ts`, función `loadSelectionForAccount` → el `db.select({...}).from(selectionCandidates)` y su mapeo con `hasCv`, `reportContent`, etc.). Encapsularlo así:

```ts
import { db } from "@/lib/drizzle/db";
import { selectionCandidates } from "@/lib/drizzle/schema";
import { eq, desc } from "drizzle-orm";

export interface PublicCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  expectedSalary: string | null;
  status: string;
  clientRating: number;
  clientNotes: string | null;
  interviewModality: string | null;
  interviewSchedule: string | null;
  offerConditions: string | null;
  rejectionReason: string | null;
  hasCv: boolean;
  reportContent: string | null;
  reportStatus: string;
}

export async function loadCandidatesForSearch(
  searchId: string
): Promise<PublicCandidate[]> {
  const rows = await db
    .select({
      id: selectionCandidates.id,
      firstName: selectionCandidates.firstName,
      lastName: selectionCandidates.lastName,
      email: selectionCandidates.email,
      phone: selectionCandidates.phone,
      linkedinUrl: selectionCandidates.linkedinUrl,
      expectedSalary: selectionCandidates.expectedSalary,
      status: selectionCandidates.status,
      clientRating: selectionCandidates.clientRating,
      clientNotes: selectionCandidates.clientNotes,
      interviewModality: selectionCandidates.interviewModality,
      interviewSchedule: selectionCandidates.interviewSchedule,
      offerConditions: selectionCandidates.offerConditions,
      rejectionReason: selectionCandidates.rejectionReason,
      cvStoragePath: selectionCandidates.cvStoragePath,
      cvUrl: selectionCandidates.cvUrl,
      reportContent: selectionCandidates.reportContent,
      reportStatus: selectionCandidates.reportStatus,
    })
    .from(selectionCandidates)
    .where(eq(selectionCandidates.searchId, searchId))
    .orderBy(desc(selectionCandidates.createdAt));
  return rows.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    linkedinUrl: c.linkedinUrl,
    expectedSalary: c.expectedSalary,
    status: c.status,
    clientRating: c.clientRating,
    clientNotes: c.clientNotes,
    interviewModality: c.interviewModality,
    interviewSchedule: c.interviewSchedule,
    offerConditions: c.offerConditions,
    rejectionReason: c.rejectionReason,
    hasCv: c.cvStoragePath != null || c.cvUrl != null,
    reportContent: c.reportContent,
    reportStatus: c.reportStatus,
  }));
}
```

> NOTA al implementar: confirmar contra `loadSelectionForAccount` que esta lista de campos coincide 1:1 con la que el portal ya entrega. Si difiere, ajustar AQUÍ y en el tipo `PublicAccountSnapshot.data.selection...candidates` debe seguir encajando (mismo shape). El tipo `Candidate` de `SelectionSection` se deriva del snapshot, así que mantener idénticos los nombres de campo.

- [ ] **Step 2: Usar el helper en `loadSelectionForAccount`**

En `lib/queries/public-account.ts`, reemplazar el bloque que carga candidatos por búsqueda para que use `loadCandidatesForSearch(s.id)`. Mantener el shape `{ searches: [{ id, position, candidates }] }`. Importar `loadCandidatesForSearch` desde `./selection-public`. (Si hoy hace una sola query de candidatos para varias búsquedas, está bien iterar por búsqueda con el helper — son pocas búsquedas por cuenta.)

- [ ] **Step 3: Loader del snapshot de una búsqueda**

Crear `lib/queries/public-search.ts`:

```ts
import { db } from "@/lib/drizzle/db";
import {
  selectionSearchShareLinks,
  selectionSearches,
  workspaces,
} from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { loadCandidatesForSearch, type PublicCandidate } from "./selection-public";

export interface PublicSearchSnapshot {
  share: { token: string; requiresPassword: boolean; passwordVersion: number };
  workspace: { name: string; logoUrl: string | null };
  search: { id: string; position: string; positionDescription: string | null };
  candidates: PublicCandidate[];
}

export interface PublicSearchLookup {
  status: "ok" | "not_found" | "inactive" | "password_required";
  snapshot?: PublicSearchSnapshot;
  shareLinkId?: string;
  passwordHash?: string;
  passwordVersion?: number;
}

export async function getPublicSearchSnapshot(
  token: string
): Promise<PublicSearchLookup> {
  const [link] = await db
    .select()
    .from(selectionSearchShareLinks)
    .where(eq(selectionSearchShareLinks.token, token))
    .limit(1);
  if (!link) return { status: "not_found" };
  if (!link.isActive) return { status: "inactive" };

  const [search] = await db
    .select({
      id: selectionSearches.id,
      position: selectionSearches.position,
      positionDescription: selectionSearches.positionDescription,
      workspaceId: selectionSearches.workspaceId,
    })
    .from(selectionSearches)
    .where(eq(selectionSearches.id, link.searchId))
    .limit(1);
  if (!search) return { status: "not_found" };

  const [ws] = await db
    .select({ name: workspaces.name, logoUrl: workspaces.logoUrl })
    .from(workspaces)
    .where(eq(workspaces.id, search.workspaceId))
    .limit(1);

  const candidates = await loadCandidatesForSearch(search.id);

  // Best-effort view tracking (no await, ignore failures).
  void db
    .update(selectionSearchShareLinks)
    .set({
      viewCount: link.viewCount + 1,
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(selectionSearchShareLinks.id, link.id))
    .catch(() => {});

  const snapshot: PublicSearchSnapshot = {
    share: {
      token: link.token,
      requiresPassword: !!link.passwordHash,
      passwordVersion: link.passwordVersion,
    },
    workspace: { name: ws?.name ?? "", logoUrl: ws?.logoUrl ?? null },
    search: {
      id: search.id,
      position: search.position,
      positionDescription: search.positionDescription,
    },
    candidates,
  };

  return {
    status: link.passwordHash ? "password_required" : "ok",
    snapshot,
    shareLinkId: link.id,
    passwordHash: link.passwordHash ?? undefined,
    passwordVersion: link.passwordVersion,
  };
}
```

- [ ] **Step 4: type-check + build**

Run: `npm run type-check; if ($?) { npm run build }`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/selection-public.ts lib/queries/public-account.ts lib/queries/public-search.ts
git commit -m "feat(seleccion): helper de candidato publico + getPublicSearchSnapshot"
```

---

## Task 5: Acciones públicas del cliente — resolver ambos tipos de token

**Files:**
- Modify: `app/actions/selection-client.ts`

**Interfaces:**
- Consumes: `selectionSearchShareLinks`, `selectionCandidates`, `accountShareLinks`.
- Produces (interno): `resolvePublicToken(token): Promise<{ accountId: string; searchId: string | null } | null>`

- [ ] **Step 1: Reemplazar el resolver de token**

En `app/actions/selection-client.ts`, agregar `selectionSearchShareLinks` y `selectionSearches` al import de schema. Reemplazar `resolveTokenAccount` por:

```ts
/** Resuelve un token público (de cuenta o de búsqueda) a su contexto. */
async function resolvePublicToken(
  token: string
): Promise<{ accountId: string; searchId: string | null } | null> {
  // 1. Link de cuenta (requiere selection habilitado).
  const [acc] = await db
    .select({
      accountId: accountShareLinks.accountId,
      isActive: accountShareLinks.isActive,
      shareConfig: accountShareLinks.shareConfig,
    })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.token, token))
    .limit(1);
  if (acc) {
    if (!acc.isActive) return null;
    if (!coerceShareConfig(acc.shareConfig).selection) return null;
    return { accountId: acc.accountId, searchId: null };
  }
  // 2. Link de búsqueda individual.
  const [sl] = await db
    .select({
      searchId: selectionSearchShareLinks.searchId,
      isActive: selectionSearchShareLinks.isActive,
    })
    .from(selectionSearchShareLinks)
    .where(eq(selectionSearchShareLinks.token, token))
    .limit(1);
  if (sl) {
    if (!sl.isActive) return null;
    const [s] = await db
      .select({ accountId: selectionSearches.accountId })
      .from(selectionSearches)
      .where(eq(selectionSearches.id, sl.searchId))
      .limit(1);
    if (!s) return null;
    return { accountId: s.accountId, searchId: sl.searchId };
  }
  return null;
}
```

- [ ] **Step 2: Verificación de candidato según el token**

Reemplazar `assertCandidateInAccount` por una que respete el `searchId` cuando el token es de búsqueda:

```ts
async function assertCandidateVisible(
  candidateId: string,
  ctx: { accountId: string; searchId: string | null }
): Promise<boolean> {
  const [c] = await db
    .select({
      accountId: selectionCandidates.accountId,
      searchId: selectionCandidates.searchId,
    })
    .from(selectionCandidates)
    .where(eq(selectionCandidates.id, candidateId))
    .limit(1);
  if (!c) return false;
  if (c.accountId !== ctx.accountId) return false;
  if (ctx.searchId && c.searchId !== ctx.searchId) return false;
  return true;
}
```

- [ ] **Step 3: Actualizar las 3 acciones públicas**

En `clientSetCandidateStatus`, `clientSaveCandidateFeedback`, `clientGetCandidateCvUrl`, reemplazar:

```ts
const accountId = await resolveTokenAccount(input.token);
if (!accountId) return { success: false, error: "Acceso inválido" }; // (o { url:null, error } en CV)
if (!(await assertCandidateInAccount(input.candidateId, accountId)))
  return { success: false, error: "Candidato no encontrado" };
```

por:

```ts
const ctx = await resolvePublicToken(input.token);
if (!ctx) return { success: false, error: "Acceso inválido" }; // CV: { url: null, error: "Acceso inválido" }
if (!(await assertCandidateVisible(input.candidateId, ctx)))
  return { success: false, error: "Candidato no encontrado" }; // CV: { url: null, error: "Candidato no encontrado" }
```

(Respetar la forma de retorno de cada función: las dos primeras devuelven `R = { success, error? }`; `clientGetCandidateCvUrl` devuelve `{ url, error? }`.)

- [ ] **Step 4: type-check + build**

Run: `npm run type-check; if ($?) { npm run build }`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/selection-client.ts
git commit -m "feat(seleccion): acciones publicas resuelven token de cuenta o de busqueda"
```

---

## Task 6: Página pública `/cs/[token]` + vista

**Files:**
- Create: `components/public-search-view.tsx`
- Create: `app/(public)/cs/[token]/page.tsx`
- Create: `app/(public)/cs/[token]/password-gate.tsx`

**Interfaces:**
- Consumes: `getPublicSearchSnapshot`, `PublicSearchSnapshot`, `SelectionSection`.

- [ ] **Step 1: Componente de la vista pública de la búsqueda**

Crear `components/public-search-view.tsx`. Reusa la `SelectionSection` (que toma `{ token, selection }` donde `selection = { searches: [...] }`). Armamos un `selection` con UNA búsqueda:

```tsx
import Link from "next/link";
import Image from "next/image";
import { SelectionSection } from "@/components/public-account-view/selection-section";
import type { PublicSearchSnapshot } from "@/lib/queries/public-search";

interface Props {
  snapshot: PublicSearchSnapshot;
}

export function PublicSearchView({ snapshot }: Props): React.ReactElement {
  const { workspace, search, candidates, share } = snapshot;
  const selection = {
    searches: [
      {
        id: search.id,
        position: search.position,
        candidates,
      },
    ],
  };
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        {workspace.logoUrl && (
          <Image
            src={workspace.logoUrl}
            alt={workspace.name || "Logo"}
            width={200}
            height={48}
            className="h-10 w-auto max-h-12 object-contain mb-2"
            unoptimized
            priority
          />
        )}
        <p className="text-xs text-muted-foreground">{workspace.name}</p>
        <h1 className="text-3xl font-semibold">{search.position}</h1>
        {search.positionDescription && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {search.positionDescription}
          </p>
        )}
      </header>

      <SelectionSection token={share.token} selection={selection} />

      <footer className="pt-8 mt-8 [border-top:1px_solid_var(--glass-border)] text-center">
        <p className="text-xs text-muted-foreground">
          Hecho con{" "}
          <Link href="https://nao.fyi" className="underline">
            nao.fyi
          </Link>
        </p>
      </footer>
    </div>
  );
}
```

> NOTA: el tipo `selection` que espera `SelectionSection` se deriva de `PublicAccountSnapshot["data"]["selection"]`. Si TypeScript se queja por campos faltantes en el objeto literal `selection`, importar ese tipo y construir el literal con el shape exacto (los `searches[].candidates` ya son `PublicCandidate`, que coincide con `Candidate`). Si el shape del search en el snapshot de cuenta tiene más campos que `{id, position, candidates}`, igualarlos acá.

- [ ] **Step 2: Password gate (clon del de `/c`)**

Crear `app/(public)/cs/[token]/password-gate.tsx` copiando `app/(public)/c/[token]/password-gate.tsx` tal cual (es agnóstico de cuenta/búsqueda: recibe `token`, `error`, `action`). Si al revisarlo no referencia nada específico de cuenta, se puede en cambio importar el existente desde la página nueva y omitir este archivo.

- [ ] **Step 3: La página**

Crear `app/(public)/cs/[token]/page.tsx` clonando la estructura de `app/(public)/c/[token]/page.tsx`, cambiando: `getPublicAccountSnapshot` → `getPublicSearchSnapshot`, `PublicAccountView` → `PublicSearchView`, y las rutas `/c/${tk}` → `/cs/${tk}`:

```tsx
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  decodeShareCookie,
  encodeShareCookie,
  shareCookieName,
  SHARE_COOKIE_TTL_MS,
} from "@/lib/share/cookie";
import {
  isRateLimited,
  recordPasswordAttempt,
  verifySharePassword,
} from "@/lib/share/password";
import { getPublicSearchSnapshot } from "@/lib/queries/public-search";
import { PasswordGate } from "./password-gate";
import { PublicSearchView } from "@/components/public-search-view";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ wrong?: string; locked?: string }>;
}

export default async function PublicSearchPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;

  const result = await getPublicSearchSnapshot(token);
  if (result.status === "not_found" || result.status === "inactive") {
    notFound();
  }
  if (!result.passwordHash) {
    return <PublicSearchView snapshot={result.snapshot!} />;
  }

  const jar = await cookies();
  const cookieValue = jar.get(shareCookieName(token))?.value;
  if (cookieValue) {
    const decoded = decodeShareCookie(cookieValue);
    if (
      decoded &&
      decoded.token === token &&
      decoded.passwordVersion === result.passwordVersion
    ) {
      return <PublicSearchView snapshot={result.snapshot!} />;
    }
  }

  let error: string | undefined;
  if (sp.wrong) error = "Contraseña incorrecta.";
  if (sp.locked) error = "Demasiados intentos. Probá de nuevo en unos minutos.";

  async function verify(formData: FormData): Promise<void> {
    "use server";
    const submitted = (formData.get("password") as string) || "";
    const tk = (formData.get("token") as string) || "";
    if (!tk) return;
    const limited = isRateLimited(tk);
    if (limited.limited) redirect(`/cs/${tk}?locked=1`);
    const fresh = await getPublicSearchSnapshot(tk);
    if (fresh.status === "not_found" || fresh.status === "inactive") {
      redirect(`/cs/${tk}`);
    }
    if (!fresh.passwordHash) redirect(`/cs/${tk}`);
    const ok = await verifySharePassword(submitted, fresh.passwordHash!);
    recordPasswordAttempt(tk, ok);
    if (!ok) redirect(`/cs/${tk}?wrong=1`);
    const cookieJar = await cookies();
    cookieJar.set({
      name: shareCookieName(tk),
      value: encodeShareCookie({
        token: tk,
        passwordVersion: fresh.passwordVersion!,
        exp: Date.now() + SHARE_COOKIE_TTL_MS,
      }),
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SHARE_COOKIE_TTL_MS / 1000,
      path: `/cs/${tk}`,
    });
    redirect(`/cs/${tk}`);
  }

  return <PasswordGate token={token} error={error} action={verify} />;
}
```

- [ ] **Step 4: type-check + build**

Run: `npm run type-check; if ($?) { npm run build }`
Expected: PASS. (En el build debe aparecer la ruta `/cs/[token]`.)

- [ ] **Step 5: Commit**

```bash
git add components/public-search-view.tsx "app/(public)/cs"
git commit -m "feat(seleccion): pagina publica /cs/[token] de una busqueda"
```

---

## Task 7: UI interna para compartir la búsqueda + verificación E2E

**Files:**
- Create: `components/selection/search-share-section.tsx`
- Modify: el componente/página donde se gestiona una búsqueda (p.ej. `components/selection/candidate-workspace.tsx` o `search-list.tsx`) para montar `SearchShareSection`.

**Interfaces:**
- Consumes: `createSearchShareLink`, `setSearchShareActive`, `setSearchSharePassword`, `getSearchShareLink` (Task 3).

- [ ] **Step 1: Componente de compartir por búsqueda**

Crear `components/selection/search-share-section.tsx`, clon adaptado de `components/account-share-section.tsx` (revisar ese archivo como plantilla). Diferencias exactas:
- Props: `{ accountId: string; searchId: string; initial: { token: string | null; isActive: boolean; hasPassword: boolean; viewCount: number } }`.
- Acciones: usar `createSearchShareLink/setSearchShareActive/setSearchSharePassword` de `@/app/actions/selection` (en vez de las de cuenta).
- URL mostrada/copiada: `${origin}/cs/${token}` (no `/c/`).
- NO incluye el panel de `shareConfig` (qué módulos mostrar) — una búsqueda no tiene config de módulos; solo: generar link, activar/desactivar, contraseña, contador de vistas, copiar.

Estructura mínima (cliente, `useTransition` + `useRouter`):

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSearchShareLink,
  setSearchShareActive,
  setSearchSharePassword,
} from "@/app/actions/selection";
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  accountId: string;
  searchId: string;
  initial: { token: string | null; isActive: boolean; hasPassword: boolean; viewCount: number };
}

export function SearchShareSection({ accountId, searchId, initial }: Props): React.ReactElement {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pwd, setPwd] = useState("");
  const url = initial.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/cs/${initial.token}`
    : null;

  return (
    <GlassCard className="p-4 flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Compartir esta búsqueda</h3>
      {!initial.token ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await createSearchShareLink({ accountId, searchId });
              router.refresh();
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium shadow hover:bg-primary/90 disabled:opacity-50"
        >
          Generar link público
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url ?? ""}
              className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => url && navigator.clipboard.writeText(url)}
              className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
            >
              Copiar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {initial.viewCount} vista{initial.viewCount === 1 ? "" : "s"} ·{" "}
            {initial.isActive ? "Activo" : "Desactivado"}
            {initial.hasPassword ? " · con contraseña" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setSearchShareActive({ accountId, searchId, isActive: !initial.isActive });
                  router.refresh();
                })
              }
              className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {initial.isActive ? "Desactivar" : "Activar"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder={initial.hasPassword ? "Nueva contraseña" : "Contraseña (opcional)"}
              className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setSearchSharePassword({ accountId, searchId, password: pwd.trim() || null });
                  setPwd("");
                  router.refresh();
                })
              }
              className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {initial.hasPassword ? "Cambiar" : "Poner"}
            </button>
            {initial.hasPassword && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await setSearchSharePassword({ accountId, searchId, password: null });
                    router.refresh();
                  })
                }
                className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                Quitar
              </button>
            )}
          </div>
        </>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 2: Montar la sección en la vista de la búsqueda**

En la página/componente de detalle de una búsqueda (donde hoy se ven sus candidatos — `app/(protected)/app/accounts/[accountId]/selection/[searchId]/page.tsx` o el componente que esa página usa), cargar el estado del link en el server component:

```ts
import { getSearchShareLink } from "@/app/actions/selection";
// ...
const share = await getSearchShareLink({ accountId, searchId });
```

y renderizar `<SearchShareSection accountId={accountId} searchId={searchId} initial={share} />` cerca del encabezado de la búsqueda. (Solo para finance/owner/admin no aplica acá — la gestión de selección ya está detrás del acceso a la cuenta; seguir el gating existente de esa página.)

- [ ] **Step 3: type-check + build**

Run: `npm run type-check; if ($?) { npm run build }`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/selection/search-share-section.tsx "app/(protected)/app/accounts/[accountId]/selection"
git commit -m "feat(seleccion): UI para compartir una busqueda por link individual"
```

- [ ] **Step 5: E2E manual (lo corre el usuario)**

1. En una cuenta con módulo Selección, crear/abrir una búsqueda con candidatos.
2. Marcar la búsqueda como **Confidencial**. En el link general del cliente (`/c/<token>` con Selección habilitada), verificar que esa búsqueda **NO** aparece y las no-confidenciales **sí**.
3. En la búsqueda, **Generar link público** → abrir `/cs/<token>` en incógnito → ver solo esa búsqueda con la marca de la agencia.
4. Puntuar un candidato + cambiar estado + abrir CV desde `/cs/<token>` → verificar que persiste (las acciones públicas resuelven el token de búsqueda).
5. Poner **contraseña** al link → reabrir `/cs/<token>` → pide contraseña; con la correcta entra, con incorrecta no.
6. **Desactivar** el link → `/cs/<token>` da not found.

---

## Self-Review

- **Spec coverage:**
  - `selection_searches.confidential` + filtro del portal → Task 1 + Task 2. ✓
  - Tabla `selection_search_share_links` → Task 1. ✓
  - Acciones internas del link (crear/activar/contraseña/estado) → Task 3. ✓
  - `getPublicSearchSnapshot` + proyección de candidato compartida → Task 4. ✓
  - Acciones públicas resuelven ambos tokens, candidato restringido a la búsqueda → Task 5. ✓
  - Ruta pública `/cs/[token]` con password gate/cookie + branding + `SelectionSection` → Task 6. ✓
  - UI interna: toggle confidencial (Task 2) + sección compartir (Task 7). ✓
  - Bordes (confidencial sin link, no-confidencial con link, password_version bump, búsqueda cerrada, informe por archivo via reportContent) → cubiertos en el diseño; el comportamiento cae naturalmente de las queries (el link individual no filtra por status ni confidential). ✓
- **Placeholder scan:** el `00XX` de la migración lo nombra drizzle (no es un placeholder de lógica). Resto sin TODO/TBD; todo el código nuevo está completo. Las dos NOTAs piden confirmar shape exacto contra el archivo fuente al implementar (verificación, no placeholder).
- **Type consistency:** `PublicCandidate` (Task 4) se usa en `getPublicSearchSnapshot` (Task 4) y en `PublicSearchView` (Task 6) vía el snapshot; `resolvePublicToken`/`assertCandidateVisible` (Task 5) con la forma `{ accountId, searchId }`; `getSearchShareLink` (Task 3) devuelve la forma `initial` que consume `SearchShareSection` (Task 7). Nombres de acciones consistentes entre Task 3 y Task 7.
