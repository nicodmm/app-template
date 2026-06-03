# Account States + Bulk Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Estados de cuenta de 3 niveles (Activo/Inactivo/Finalizado) con archivado, selección múltiple en el portfolio (cambiar estado / eliminar), cambio de estado en el interno, + ajustes de form y finanzas (consultores con checks, fecha de finalización, retítulo, sacar LTV, historial ARS+USD, proyección 6 meses).

**Architecture:** `closedAt` sigue siendo el marcador de archivado; una columna `close_reason` distingue inactivo/finalizado y `end_date` guarda fin de proyecto. Acciones individuales y en bloque comparten `assertCanWriteAccount`. El grid del portfolio se envuelve en un componente cliente con modo selección.

**Tech Stack:** Next.js 15, React 19, Drizzle ORM, Tailwind v4. Gates: `npm run type-check`, `npm run build`. DB: `npm run db:generate` → crear `down.sql` → `npm run db:migrate` (dev/prod comparten Supabase).

**Spec:** `docs/superpowers/specs/2026-06-03-account-states-bulk-design.md`

---

## Task 1: Migración — columnas `close_reason` y `end_date`

**Files:**
- Modify: `lib/drizzle/schema/accounts.ts`
- Create: `drizzle/migrations/<generated>/down.sql`

- [ ] **Step 1:** Agregar columnas al schema (después de `closedAt`):

```ts
    closedAt: timestamp("closed_at"),
    closeReason: text("close_reason"),
    endDate: date("end_date"),
```

- [ ] **Step 2:** Generar la migración: `npm run db:generate`. Anotar el nombre de la carpeta nueva en `drizzle/migrations/`.

- [ ] **Step 3:** Crear `down.sql` en esa carpeta:

```sql
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "close_reason";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "end_date";
```

- [ ] **Step 4:** Aplicar: `npm run db:migrate`. Esperado: migración aplicada sin error.
- [ ] **Step 5:** `npm run type-check` → PASS.
- [ ] **Step 6: Commit** `feat(accounts): add close_reason + end_date columns`

---

## Task 2: Helper de estado

**Files:**
- Create: `lib/accounts/status.ts`

- [ ] **Step 1:** Crear el helper:

```ts
export type AccountStatus = "active" | "inactive" | "finished";

export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  finished: "Finalizado",
};

/** Estado de ciclo de vida derivado de closedAt + closeReason. */
export function accountStatus(a: {
  closedAt: Date | null;
  closeReason: string | null;
}): AccountStatus {
  if (a.closedAt == null) return "active";
  return a.closeReason === "inactive" ? "inactive" : "finished";
}
```

- [ ] **Step 2:** `npm run type-check` → PASS.
- [ ] **Step 3: Commit** `feat(accounts): account status helper`

---

## Task 3: Server actions — estado individual, bulk, endDate

**Files:**
- Modify: `app/actions/accounts.ts`

- [ ] **Step 1:** Imports: agregar `sql` a drizzle y el tipo de estado:

```ts
import { eq, and, sql } from "drizzle-orm";
import type { AccountStatus } from "@/lib/accounts/status";
```
(Mantener los imports existentes; `sql` se suma a `eq, and`.)

- [ ] **Step 2:** Agregar parser de fecha fin (junto a `parseStartDate`):

```ts
function parseEndDate(raw: string | null): string | null {
  return parseStartDate(raw);
}
```

- [ ] **Step 3:** En `createAccount`, parsear y persistir `endDate`. Tras `const startDate = ...`:

```ts
  const endDate = parseEndDate(formData.get("endDate") as string | null);
```
Y en el `.values({...})` del insert de `accounts`, agregar `endDate,` junto a `startDate,`.

- [ ] **Step 4:** En `updateAccount`, igual: tras `const startDate = ...` agregar
  `const endDate = parseEndDate(formData.get("endDate") as string | null);` y en el `.set({...})`
  agregar `endDate,`.

- [ ] **Step 5:** Reemplazar `closeAccount` y `reopenAccount` por `setAccountStatus` + bulk
  (dejar `deleteAccount` como está). Reemplazar las dos funciones existentes por:

```ts
export async function setAccountStatus(
  accountId: string,
  status: AccountStatus
): Promise<{ success: boolean; error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrThrow(userId);
  try {
    await assertCanWriteAccount(userId, workspace.id, accountId);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Sin permisos" };
  }
  await db
    .update(accounts)
    .set({
      closedAt: status === "active" ? null : sql`coalesce(${accounts.closedAt}, now())`,
      closeReason: status === "active" ? null : status,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
  revalidatePath("/app/portfolio");
  revalidatePath("/app/dashboard");
  return { success: true };
}

/** Reabrir = volver a activo. Conservado para el banner de archivada. */
export async function reopenAccount(accountId: string): Promise<void> {
  await setAccountStatus(accountId, "active");
}

export async function bulkSetAccountStatus(
  accountIds: string[],
  status: AccountStatus
): Promise<{ success: boolean; updated: number; denied: number }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrThrow(userId);
  let updated = 0;
  let denied = 0;
  for (const id of accountIds) {
    try {
      await assertCanWriteAccount(userId, workspace.id, id);
    } catch {
      denied += 1;
      continue;
    }
    await db
      .update(accounts)
      .set({
        closedAt: status === "active" ? null : sql`coalesce(${accounts.closedAt}, now())`,
        closeReason: status === "active" ? null : status,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, id), eq(accounts.workspaceId, workspace.id)));
    updated += 1;
  }
  revalidatePath("/app/portfolio");
  revalidatePath("/app/dashboard");
  return { success: true, updated, denied };
}

export async function bulkDeleteAccounts(
  accountIds: string[]
): Promise<{ success: boolean; deleted: number; denied: number }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrThrow(userId);
  let deleted = 0;
  let denied = 0;
  for (const id of accountIds) {
    try {
      await assertCanWriteAccount(userId, workspace.id, id);
    } catch {
      denied += 1;
      continue;
    }
    await db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.workspaceId, workspace.id)));
    deleted += 1;
  }
  revalidatePath("/app/portfolio");
  revalidatePath("/app/dashboard");
  return { success: true, deleted, denied };
}
```
  Eliminar la función `closeAccount` anterior (su única UI, `AccountStatusActions`, se reemplaza
  en Task 6). `reopenAccount` queda reimplementada arriba.

- [ ] **Step 6:** `npm run type-check` → PASS.
- [ ] **Step 7: Commit** `feat(accounts): setAccountStatus + bulk status/delete + endDate`

---

## Task 4: Selector de estado en el interno + banner

**Files:**
- Create: `components/account-status-select.tsx`
- Modify: `components/archived-account-banner.tsx`
- Modify: `app/(protected)/app/accounts/[accountId]/page.tsx`
- Delete: `components/account-status-actions.tsx`

- [ ] **Step 1:** Crear `account-status-select.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAccountStatus } from "@/app/actions/accounts";
import { STATUS_LABELS, type AccountStatus } from "@/lib/accounts/status";

export function AccountStatusSelect({
  accountId,
  status,
}: {
  accountId: string;
  status: AccountStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: AccountStatus) {
    if (next === status) return;
    startTransition(async () => {
      await setAccountStatus(accountId, next);
      router.refresh();
    });
  }

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => change(e.target.value as AccountStatus)}
      aria-label="Estado de la cuenta"
      className="rounded-md px-3 py-1.5 text-xs font-medium backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
    >
      {(["active", "inactive", "finished"] as const).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2:** `archived-account-banner.tsx`: aceptar `closeReason` y mostrar el estado.
  Cambiar la interfaz y el texto:

```tsx
interface ArchivedAccountBannerProps {
  accountId: string;
  closedAt: Date;
  closeReason: string | null;
}

export function ArchivedAccountBanner({
  accountId,
  closedAt,
  closeReason,
}: ArchivedAccountBannerProps) {
```
  Y reemplazar el `<p className="font-medium">Esta cuenta está archivada</p>` por:

```tsx
            <p className="font-medium">
              Esta cuenta está {closeReason === "inactive" ? "inactiva" : "finalizada"}
            </p>
```

- [ ] **Step 3:** En `accounts/[accountId]/page.tsx`:
  - Reemplazar el import `AccountStatusActions` por:

```tsx
import { AccountStatusSelect } from "@/components/account-status-select";
import { accountStatus } from "@/lib/accounts/status";
```
  - Reemplazar el uso `<AccountStatusActions accountId={accountId} closedAt={account.closedAt} />`
    por `<AccountStatusSelect accountId={accountId} status={accountStatus(account)} />`.
  - En `<ArchivedAccountBanner ...>` agregar la prop `closeReason={account.closeReason}`.

- [ ] **Step 4:** Borrar `components/account-status-actions.tsx`
  (`git rm components/account-status-actions.tsx`).

- [ ] **Step 5:** `npm run type-check` → PASS.
- [ ] **Step 6: Commit** `feat(accounts): status selector + banner reason in detail`

---

## Task 5: AccountCard — selección + chip de estado

**Files:**
- Modify: `components/account-card.tsx`

- [ ] **Step 1:** Cambiar la interfaz y extraer el contenido para soportar modo selección.
  Reemplazar `interface AccountCardProps` y el cuerpo del componente por:

```tsx
import { cn } from "@/lib/utils";

interface AccountCardProps {
  account: AccountWithOwner;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}

export function AccountCard({
  account,
  selectable = false,
  selected = false,
  onToggle,
}: AccountCardProps) {
  const signal = (account.healthSignal ?? "inactive") as keyof typeof HEALTH_CONFIG;
  const config = HEALTH_CONFIG[signal] ?? HEALTH_CONFIG.inactive;
  const Icon = config.Icon;

  const daysSinceActivity = account.lastActivityAt
    ? Math.floor(
        (Date.now() - new Date(account.lastActivityAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {account.name}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {account.closedAt && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                account.closeReason === "inactive"
                  ? "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800"
                  : "bg-slate-200 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
              )}
            >
              {account.closeReason === "inactive" ? "Inactiva" : "Finalizada"}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              config.className
            )}
          >
            <Icon size={11} aria-hidden />
            {config.label}
          </span>
        </div>
      </div>

      {account.healthJustification && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {account.healthJustification}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{account.ownerName ?? account.ownerEmail ?? "Sin responsable"}</span>
        <span>
          {daysSinceActivity !== null && daysSinceActivity > 30 ? (
            <span className="text-amber-700 dark:text-amber-300 font-medium">
              Sin actividad {daysSinceActivity}d
            </span>
          ) : (
            relativeTime(account.lastActivityAt)
          )}
        </span>
      </div>
    </>
  );

  const base = cn(
    "group block rounded-xl p-5 backdrop-blur-[14px] transition-all relative",
    "[background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]",
    account.closedAt && "opacity-60"
  );

  if (selectable) {
    return (
      <div
        role="checkbox"
        aria-checked={selected}
        tabIndex={0}
        onClick={() => onToggle?.(account.id)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onToggle?.(account.id);
          }
        }}
        className={cn(
          base,
          "cursor-pointer",
          selected && "ring-2 ring-primary [background:var(--glass-bg-strong)]"
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          readOnly
          aria-hidden
          className="absolute right-3 top-3 rounded border-border text-primary pointer-events-none"
        />
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/app/accounts/${account.id}`}
      className={cn(
        base,
        "hover:[background:var(--glass-bg-strong)] hover:translate-y-[-1px] hover:[box-shadow:0_14px_44px_-14px_rgba(15,18,53,0.22)]"
      )}
    >
      {inner}
    </Link>
  );
}
```
  (Mantener arriba los imports de `Link`, iconos, `AccountWithOwner` y el bloque
  `HEALTH_CONFIG` + `relativeTime` ya existentes. Asegurar que `cn` esté importado.)

- [ ] **Step 2:** `npm run type-check` → PASS.
- [ ] **Step 3: Commit** `feat(portfolio): account card selection + archived state chip`

---

## Task 6: PortfolioGrid con modo selección + barra de acciones

**Files:**
- Create: `components/portfolio-grid.tsx`
- Modify: `app/(protected)/app/portfolio/page.tsx`

- [ ] **Step 1:** Crear `portfolio-grid.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Trash2, X } from "lucide-react";
import { AccountCard } from "@/components/account-card";
import { bulkSetAccountStatus, bulkDeleteAccounts } from "@/app/actions/accounts";
import type { AccountWithOwner } from "@/lib/queries/accounts";
import type { AccountStatus } from "@/lib/accounts/status";

export function PortfolioGrid({ accounts }: { accounts: AccountWithOwner[] }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }
  function selectAll() {
    setSelected(new Set(accounts.map((a) => a.id)));
  }

  function applyStatus(status: AccountStatus) {
    if (selected.size === 0) return;
    startTransition(async () => {
      await bulkSetAccountStatus(Array.from(selected), status);
      exitSelect();
      router.refresh();
    });
  }
  function remove() {
    if (selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} cuenta(s)? Es irreversible.`)) return;
    startTransition(async () => {
      await bulkDeleteAccounts(Array.from(selected));
      exitSelect();
      router.refresh();
    });
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-accent/50 disabled:opacity-50";

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        {selecting ? (
          <>
            <button type="button" onClick={exitSelect} className={btn}>
              <X size={14} aria-hidden /> Cancelar
            </button>
            <button type="button" onClick={selectAll} className={btn}>
              Seleccionar todas
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setSelecting(true)} className={btn}>
            <CheckSquare size={14} aria-hidden /> Seleccionar
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            selectable={selecting}
            selected={selected.has(a.id)}
            onToggle={toggle}
          />
        ))}
      </div>

      {selecting && selected.size > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 backdrop-blur-[16px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
          </span>
          <select
            disabled={pending}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value as AccountStatus | "";
              e.currentTarget.value = "";
              if (v) applyStatus(v);
            }}
            className="rounded-md px-2 py-1.5 text-xs bg-transparent [border:1px_solid_var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            <option value="">Cambiar estado…</option>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
            <option value="finished">Finalizado</option>
          </select>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} aria-hidden /> Eliminar
          </button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2:** En `portfolio/page.tsx`: importar `PortfolioGrid` y reemplazar el bloque del
  grid. Cambiar:

```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
```
  por:
```tsx
        <PortfolioGrid accounts={accounts} />
```
  Agregar `import { PortfolioGrid } from "@/components/portfolio-grid";` y quitar el import de
  `AccountCard` si queda sin uso.

- [ ] **Step 3:** `npm run type-check` && `npm run build` → PASS.
- [ ] **Step 4: Commit** `feat(portfolio): multi-select grid with bulk status/delete bar`

---

## Task 7: Form de crear cuenta — consultores con checks + fecha fin + título

**Files:**
- Create: `components/end-date-field.tsx`
- Modify: `app/(protected)/app/accounts/new/page.tsx`
- Modify: `components/edit-account-form.tsx`

- [ ] **Step 1:** Crear `end-date-field.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EndDateField({ defaultValue }: { defaultValue?: string | null }) {
  const [has, setHas] = useState(!!defaultValue);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={has}
          onChange={(e) => setHas(e.target.checked)}
          className="rounded border-border text-primary"
        />
        ¿Tiene fecha de finalización?
      </label>
      {has && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endDate">Fecha de finalización del proyecto</Label>
          <Input id="endDate" name="endDate" type="date" defaultValue={defaultValue ?? ""} />
        </div>
      )}
    </div>
  );
}
```
  (Cuando el check está apagado el input no se renderiza → no se envía → `endDate` queda null.)

- [ ] **Step 2:** En `accounts/new/page.tsx`:
  - Importar `import { EndDateField } from "@/components/end-date-field";`.
  - Reemplazar el `<select multiple ... name="consultantIds">` por checkboxes. Cambiar el bloque
    de Consultores por:

```tsx
          <div className="flex flex-col gap-1.5">
            <Label>Consultores</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {members.map((m) => (
                <label
                  key={m.userId}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="checkbox"
                    name="consultantIds"
                    value={m.userId}
                    className="rounded border-border text-primary"
                  />
                  {m.displayName}
                </label>
              ))}
            </div>
          </div>
```
  - Debajo del bloque "Fecha de inicio del proyecto" / "Fee mensual (USD)" (el `grid` de 2 cols),
    agregar `<EndDateField />`.
  - Cambiar el label `Términos de Contratación` por `Términos de contratación y pagos`.

- [ ] **Step 3:** En `edit-account-form.tsx`: importar `EndDateField` y, debajo del grid de
  "Fecha de inicio" / "Fee mensual", agregar `<EndDateField defaultValue={account.endDate} />`.
  (`account.endDate` ya existe en el tipo tras Task 1.)

- [ ] **Step 4:** `npm run type-check` && `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(accounts): consultant checkboxes + optional end date + título`

---

## Task 8: Finanzas — sacar LTV, historial ARS+USD

**Files:**
- Modify: `lib/queries/finance.ts`
- Modify: `components/finance/billing-list.tsx`
- Modify: `components/finance/finanzas-tabs.tsx`
- Modify: `app/(protected)/app/finanzas/page.tsx`

- [ ] **Step 1:** En `lib/queries/finance.ts`, reescribir `getBillingHistory` para devolver USD
  además de ARS. Reemplazar la interfaz y la función:

```ts
export interface BillingHistoryRow {
  year: number;
  month: number;
  totalArs: number;
  totalUsd: number;
}

export async function getBillingHistory(
  workspaceId: string
): Promise<BillingHistoryRow[]> {
  const rows = await db
    .select({
      year: billingRecords.year,
      month: billingRecords.month,
      amountArs: billingRecords.amountArs,
      amountOriginal: billingRecords.amountOriginal,
      currencyOriginal: billingRecords.currencyOriginal,
      fxRateUsed: billingRecords.fxRateUsed,
    })
    .from(billingRecords)
    .where(eq(billingRecords.workspaceId, workspaceId));

  const map = new Map<string, BillingHistoryRow>();
  for (const r of rows) {
    const key = `${r.year}-${r.month}`;
    const ars = r.amountArs == null ? 0 : Number(r.amountArs);
    const fx = r.fxRateUsed == null ? 0 : Number(r.fxRateUsed);
    const usd =
      r.currencyOriginal === "USD"
        ? Number(r.amountOriginal)
        : fx > 0
          ? ars / fx
          : 0;
    const acc = map.get(key) ?? { year: r.year, month: r.month, totalArs: 0, totalUsd: 0 };
    acc.totalArs += ars;
    acc.totalUsd += usd;
    map.set(key, acc);
  }

  return Array.from(map.values())
    .map((r) => ({ ...r, totalArs: round2(r.totalArs), totalUsd: round2(r.totalUsd) }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}
```
  (`round2` ya está importado de `@/lib/finance/compute` al tope del archivo.)

- [ ] **Step 2:** En `billing-list.tsx`:
  - Quitar `ltv` y `LtvRow` de `Props` y del import de tipos. Quitar el parámetro `ltv` de la
    firma del componente.
  - Eliminar todo el segundo `<GlassCard>` del grid "History + LTV panels" que renderiza
    "LTV por cuenta" (desde `<GlassCard className="p-4">` con `<h3>...LTV por cuenta</h3>` hasta
    su cierre, incluida la nota `* Estimación: ...`). Dejar solo el panel de historial.
  - Cambiar el contenedor `<div className="grid gap-4 md:grid-cols-2">` por `<div className="grid gap-4">`
    (ya no hay dos paneles).
  - Agregar formateador USD y mostrar ambas columnas en el historial. Cerca de `arsFmt`:

```ts
const usdFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
```
  - Reemplazar el `<li>` del historial para mostrar ARS y USD:

```tsx
              {history.map((h) => (
                <li key={`${h.year}-${h.month}`} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {MONTHS[h.month]} {h.year}
                  </span>
                  <span className="flex-1 h-2 rounded-full bg-white/30 dark:bg-white/10 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: `${maxHistory > 0 ? (h.totalArs / maxHistory) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span className="w-32 shrink-0 text-right text-xs tabular-nums">
                    {arsFmt.format(h.totalArs)}
                  </span>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {usdFmt.format(h.totalUsd)}
                  </span>
                </li>
              ))}
```
  - `maxHistory` sigue calculándose sobre `totalArs` (ya existe: `history.reduce((m,h)=>Math.max(m,h.totalArs),0)`).

- [ ] **Step 3:** En `finanzas-tabs.tsx`: quitar `ltv` y `LtvRow` de `Props`/imports y de las props
  pasadas a `<BillingList ...>` (quitar `ltv={ltv}`). Quitar `ltv` del destructuring del componente.

- [ ] **Step 4:** En `finanzas/page.tsx`: quitar `getLtvByAccount` del import y de `Promise.all`
  (sacar la línea `getLtvByAccount(workspace.id),` y la variable `ltv` del destructuring), y quitar
  `ltv={ltv}` del `<FinanzasTabs>`.

- [ ] **Step 5:** `npm run type-check` && `npm run build` → PASS.
- [ ] **Step 6: Commit** `feat(finanzas): drop LTV panel; billing history in ARS + USD`

---

## Task 9: Proyección de facturación a 6 meses

**Files:**
- Create: `lib/finance/projection.ts`
- Create: `components/finance/account-projection-panel.tsx`
- Modify: `app/(protected)/app/finanzas/[accountId]/page.tsx`

- [ ] **Step 1:** Crear `lib/finance/projection.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accounts,
  financeEngagements,
  financeEngagementPeriods,
} from "@/lib/drizzle/schema";
import { getFxRate } from "@/lib/queries/finance";
import {
  isActiveInMonth,
  convertToArs,
  round2,
  monthBounds,
  type BillingRule,
} from "@/lib/finance/compute";

export interface ProjectionMonth {
  year: number;
  month: number;
  totalArs: number;
  totalUsd: number;
}

function addMonth(year: number, month: number, n: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/**
 * Proyección de facturación de una cuenta para los próximos `months` meses.
 * Suma los fees de engagements activos cuyo período cae en cada mes, convertidos
 * a ARS al TC del mes (o al más reciente como fallback) y su equivalente USD.
 * Si la cuenta tiene endDate, los meses cuyo inicio supera esa fecha proyectan 0.
 */
export async function projectAccountBilling(
  workspaceId: string,
  accountId: string,
  fromYear: number,
  fromMonth: number,
  months = 6
): Promise<ProjectionMonth[]> {
  const engs = await db
    .select()
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.workspaceId, workspaceId),
        eq(financeEngagements.accountId, accountId),
        eq(financeEngagements.status, "active")
      )
    );
  const ids = engs.map((e) => e.id);
  const periods = ids.length
    ? await db
        .select()
        .from(financeEngagementPeriods)
        .where(inArray(financeEngagementPeriods.engagementId, ids))
    : [];

  const [acct] = await db
    .select({ endDate: accounts.endDate })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const endDate = acct?.endDate ?? null;

  const out: ProjectionMonth[] = [];
  for (let i = 0; i < months; i++) {
    const { year, month } = addMonth(fromYear, fromMonth, i);
    const { start } = monthBounds(year, month);

    // Proyecto terminado: nada que facturar.
    if (endDate && start > endDate) {
      out.push({ year, month, totalArs: 0, totalUsd: 0 });
      continue;
    }

    const fx = await getFxRate(workspaceId, year, month);
    const mep = fx?.mepRate ?? null;
    const ipc = fx?.ipcCoefficient ?? null;

    let ars = 0;
    let usd = 0;
    for (const e of engs) {
      const p = periods.find(
        (pp) => pp.engagementId === e.id && isActiveInMonth(pp.fromDate, pp.toDate, year, month)
      );
      if (!p) continue;
      const fee = Number(p.fee);
      const arsAmt = convertToArs(fee, p.currency, e.billingRule as BillingRule, mep, ipc);
      if (arsAmt != null) ars += arsAmt;
      usd += p.currency === "USD" ? fee : mep && mep > 0 ? fee / mep : 0;
    }
    out.push({ year, month, totalArs: round2(ars), totalUsd: round2(usd) });
  }
  return out;
}
```

- [ ] **Step 2:** Crear `components/finance/account-projection-panel.tsx`:

```tsx
import type { ProjectionMonth } from "@/lib/finance/projection";

const MONTHS: Record<number, string> = {
  1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
};
const arsFmt = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", maximumFractionDigits: 0,
});
const usdFmt = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});

export function AccountProjectionPanel({ months }: { months: ProjectionMonth[] }) {
  const totalArs = months.reduce((s, m) => s + m.totalArs, 0);
  const totalUsd = months.reduce((s, m) => s + m.totalUsd, 0);

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Proyección 6 meses
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b [border-color:var(--glass-border)]">
            <th className="py-2 text-left font-semibold text-muted-foreground">Mes</th>
            <th className="py-2 text-right font-semibold text-muted-foreground">ARS</th>
            <th className="py-2 text-right font-semibold text-muted-foreground">USD</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={`${m.year}-${m.month}`} className="border-b last:border-0 [border-color:var(--glass-border)]">
              <td className="py-1.5">{MONTHS[m.month]} {m.year}</td>
              <td className="py-1.5 text-right tabular-nums">{arsFmt.format(m.totalArs)}</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{usdFmt.format(m.totalUsd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t [border-color:var(--glass-border)]">
            <td className="py-2 font-semibold">Total</td>
            <td className="py-2 text-right font-semibold tabular-nums">{arsFmt.format(totalArs)}</td>
            <td className="py-2 text-right font-semibold tabular-nums">{usdFmt.format(totalUsd)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-[10px] text-muted-foreground">
        Estimación a partir de los fees activos y el TC de cada mes (o el más reciente). Si la
        cuenta tiene fecha de finalización, los meses posteriores proyectan 0.
      </p>
    </div>
  );
}
```

- [ ] **Step 3:** En `finanzas/[accountId]/page.tsx`:
  - Importar:
```tsx
import { projectAccountBilling } from "@/lib/finance/projection";
import { AccountProjectionPanel } from "@/components/finance/account-projection-panel";
```
  - Tras calcular `billing` (después del `Promise.all`), agregar:
```tsx
  const projection = await projectAccountBilling(workspace.id, accountId, year, month);
```
  - Después del `<GlassCard>` que contiene `<AccountBillingPanel .../>`, agregar:
```tsx
      <GlassCard className="p-6">
        <AccountProjectionPanel months={projection} />
      </GlassCard>
```

- [ ] **Step 4:** `npm run type-check` && `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(finanzas): 6-month billing projection per account`

---

## Task 10: Verificación final + deploy

- [ ] **Step 1:** `npm run type-check` → PASS.
- [ ] **Step 2:** `npm run build` → PASS.
- [ ] **Step 3:** Merge a master + push (Vercel deploy; no hay cambios en `trigger/**` salvo que
  Task 8/9 no tocan trigger, así que no se redeploya el worker). Confirmar deploy de Vercel.
- [ ] **Step 4:** Verificación manual en nao.fyi: estados individuales + bulk; eliminar bulk con
  confirmación y permisos; chips Inactiva/Finalizada en Archivadas; crear cuenta con consultores
  tildados + fecha de finalización; "A facturar" sin LTV; historial ARS+USD; proyección 6 meses.

---

## Self-review notes

- **Migración:** dos columnas nullable, sin backfill (cuentas existentes: closeReason null →
  archivadas previas se muestran como "Finalizada" por default del helper). Aceptable.
- **Cobertura del spec:** estados (T1-T4), bulk (T3,T5,T6), interno (T4,T7 título), consultores
  checks (T7), fecha fin (T1,T3,T7), retítulo (T4,T7), sacar LTV + historial ARS+USD (T8),
  proyección 6 meses (T9). ✓
- **getLtvByAccount** queda exportada pero sin uso tras T8; se deja (sin costo runtime). Si se
  prefiere, removerla es trivial.
- **Permisos:** todas las acciones (individual y bulk) pasan por `assertCanWriteAccount`.
- Sin cambios en `trigger/**` → no requiere `trigger.dev deploy`.
