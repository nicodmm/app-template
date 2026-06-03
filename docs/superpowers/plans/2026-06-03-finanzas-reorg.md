# Finanzas Reorg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mover la operación financiera del interno de la cuenta a `/app/finanzas`, con facturación automática mes a mes (fee base + extras de términos) y detalle por cuenta en ruta dedicada.

**Architecture:** Engagement base automático sembrado desde `account.fee` (`source="account_fee"`, nunca borrado por el LLM) + extras estructurados por IA + generación idempotente del mes en cada carga y por cron. Detalle por cuenta en `/app/finanzas/[accountId]`; el interno de la cuenta queda con consultores + un textarea de términos.

**Tech Stack:** Next.js 15 App Router, React 19, Drizzle ORM, Trigger.dev v3, Tailwind v4. Sin test runner: las puertas son `npm run type-check`, `npm run lint`, `npm run build`.

**Spec:** `docs/superpowers/specs/2026-06-03-finanzas-reorg-design.md`

---

## Task 1: Helper `ensureBaseEngagement` + sync

**Files:**
- Create: `lib/finance/base-engagement.ts`

- [ ] **Step 1: Crear el helper**

```ts
import { db } from "@/lib/drizzle/db";
import { financeEngagements, financeEngagementPeriods } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";

const BASE_SOURCE = "account_fee";
const BASE_NEURONA = "Fee mensual";

function firstOfCurrentMonthISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Idempotente. Mantiene a lo sumo UN engagement base (source="account_fee") por
 * cuenta que representa el fee mensual recurrente en USD (regla MEP).
 * - fee null/0 → si existe, lo marca status="ended"; no crea nada.
 * - fee > 0 → crea engagement+período base si no existe; si existe, sincroniza
 *   fee del período abierto y la fecha de inicio, y reactiva (status="active").
 */
export async function ensureBaseEngagement(
  accountId: string,
  workspaceId: string,
  opts: { fee: string | null; startDate: string | null }
): Promise<void> {
  const start = opts.startDate ?? firstOfCurrentMonthISO();
  const feeNum = opts.fee != null ? Number(opts.fee) : NaN;
  const hasFee = Number.isFinite(feeNum) && feeNum > 0;

  const [existing] = await db
    .select()
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.accountId, accountId),
        eq(financeEngagements.source, BASE_SOURCE)
      )
    )
    .limit(1);

  if (!hasFee) {
    if (existing && existing.status !== "ended") {
      await db
        .update(financeEngagements)
        .set({ status: "ended", updatedAt: new Date() })
        .where(eq(financeEngagements.id, existing.id));
    }
    return;
  }

  if (!existing) {
    const [eng] = await db
      .insert(financeEngagements)
      .values({
        workspaceId,
        accountId,
        neurona: BASE_NEURONA,
        currency: "USD",
        billingRule: "mep",
        startDate: start,
        endDate: null,
        status: "active",
        source: BASE_SOURCE,
      })
      .returning({ id: financeEngagements.id });
    await db.insert(financeEngagementPeriods).values({
      engagementId: eng.id,
      accountId,
      workspaceId,
      fromDate: start,
      toDate: null,
      fee: String(feeNum),
      currency: "USD",
      source: BASE_SOURCE,
    });
    return;
  }

  await db
    .update(financeEngagements)
    .set({ status: "active", startDate: start, updatedAt: new Date() })
    .where(eq(financeEngagements.id, existing.id));

  // Sincronizar el período base abierto (toDate null). Si no hay, crear uno.
  const [openPeriod] = await db
    .select()
    .from(financeEngagementPeriods)
    .where(
      and(
        eq(financeEngagementPeriods.engagementId, existing.id),
        eq(financeEngagementPeriods.source, BASE_SOURCE)
      )
    )
    .limit(1);

  if (openPeriod) {
    await db
      .update(financeEngagementPeriods)
      .set({ fee: String(feeNum), fromDate: start, updatedAt: new Date() })
      .where(eq(financeEngagementPeriods.id, openPeriod.id));
  } else {
    await db.insert(financeEngagementPeriods).values({
      engagementId: existing.id,
      accountId,
      workspaceId,
      fromDate: start,
      toDate: null,
      fee: String(feeNum),
      currency: "USD",
      source: BASE_SOURCE,
    });
  }
}

export { BASE_SOURCE as BASE_ENGAGEMENT_SOURCE, BASE_NEURONA };
```

- [ ] **Step 2:** `npm run type-check` → PASS.
- [ ] **Step 3: Commit** `feat(finanzas): ensureBaseEngagement helper`

---

## Task 2: Núcleo de generación mensual reutilizable

**Files:**
- Create: `lib/finance/run-monthly-billing.ts`
- Modify: `app/actions/finance.ts` (refactor `generateBillingForMonth` para usar el núcleo)

- [ ] **Step 1: Crear el núcleo** (mueve la lógica del loop de `generateBillingForMonth`)

```ts
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  financeEngagements,
  financeEngagementPeriods,
  billingRecords,
} from "@/lib/drizzle/schema";
import { getFxRate } from "@/lib/queries/finance";
import { isActiveInMonth, convertToArs, type BillingRule } from "@/lib/finance/compute";

/**
 * Upsert idempotente de las filas de facturación NO adicionales para el mes,
 * a partir de los engagements activos del workspace. Preserva status/billedAt/paidAt.
 * Reutilizado por el server action y el cron mensual.
 */
export async function runMonthlyBilling(
  workspaceId: string,
  year: number,
  month: number
): Promise<{ created: number; updated: number }> {
  const fx = await getFxRate(workspaceId, year, month);

  const engagements = await db
    .select()
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.workspaceId, workspaceId),
        eq(financeEngagements.status, "active")
      )
    );
  if (engagements.length === 0) return { created: 0, updated: 0 };

  const engagementIds = engagements.map((e) => e.id);
  const periods = await db
    .select()
    .from(financeEngagementPeriods)
    .where(inArray(financeEngagementPeriods.engagementId, engagementIds));

  let created = 0;
  let updated = 0;

  for (const engagement of engagements) {
    const activePeriod = periods.find(
      (p) =>
        p.engagementId === engagement.id &&
        isActiveInMonth(p.fromDate, p.toDate, year, month)
    );
    if (!activePeriod) continue;

    const fee = Number(activePeriod.fee);
    const currency = activePeriod.currency;
    const amountArs = convertToArs(
      fee,
      currency,
      engagement.billingRule as BillingRule,
      fx?.mepRate ?? null,
      fx?.ipcCoefficient ?? null
    );

    const [existing] = await db
      .select({ id: billingRecords.id })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.accountId, engagement.accountId),
          eq(billingRecords.engagementId, engagement.id),
          eq(billingRecords.year, year),
          eq(billingRecords.month, month),
          eq(billingRecords.isAdditional, false)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(billingRecords)
        .set({
          amountOriginal: String(fee),
          currencyOriginal: currency,
          amountArs: amountArs == null ? null : String(amountArs),
          fxRateUsed: fx ? String(fx.mepRate) : null,
          ipcUsed: fx ? String(fx.ipcCoefficient) : null,
          concept: engagement.neurona,
          updatedAt: new Date(),
        })
        .where(eq(billingRecords.id, existing.id));
      updated += 1;
    } else {
      await db.insert(billingRecords).values({
        workspaceId,
        accountId: engagement.accountId,
        engagementId: engagement.id,
        year,
        month,
        concept: engagement.neurona,
        amountOriginal: String(fee),
        currencyOriginal: currency,
        amountArs: amountArs == null ? null : String(amountArs),
        fxRateUsed: fx ? String(fx.mepRate) : null,
        ipcUsed: fx ? String(fx.ipcCoefficient) : null,
        status: "pending",
        isAdditional: false,
      });
      created += 1;
    }
  }

  return { created, updated };
}
```

- [ ] **Step 2: Refactor** `generateBillingForMonth` en `app/actions/finance.ts` para delegar:
  reemplazar el cuerpo del loop (líneas que arman engagements/periods/billing) por
  `const { created, updated } = await runMonthlyBilling(workspaceId, year, month);`
  manteniendo `requireFinanceWorkspace`, validación de mes, `revalidatePath("/app/finanzas")`
  y el retorno `{ success, created, updated }`. Importar `runMonthlyBilling`.

- [ ] **Step 3:** `npm run type-check` → PASS.
- [ ] **Step 4: Commit** `refactor(finanzas): extract runMonthlyBilling core`

---

## Task 3: Sembrado/sync del engagement base en create/update de cuenta

**Files:**
- Modify: `app/actions/accounts.ts`

- [ ] **Step 1:** En `createAccount`, después del `insert(accounts)...returning()` y antes del
  redirect, agregar (importar `ensureBaseEngagement`, `accountFinance`, `accountConsultants`):

```ts
// Finanzas: fila account_finance con términos + consultores + engagement base.
const terms = ((formData.get("terms") as string) || "").trim() || null;
const consultantIds = (formData.getAll("consultantIds") as string[]).filter(Boolean);

await db.insert(accountFinance).values({
  accountId: account.id,
  workspaceId: workspace.id,
  termsRawText: terms,
});

if (consultantIds.length) {
  await db
    .insert(accountConsultants)
    .values(
      consultantIds.map((uid) => ({
        workspaceId: workspace.id,
        accountId: account.id,
        userId: uid,
        neurona: null,
        roleLabel: null,
      }))
    )
    .onConflictDoNothing();
}

await ensureBaseEngagement(account.id, workspace.id, { fee, startDate });

if (terms) {
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("structure-finance-terms", {
      accountId: account.id,
      workspaceId: workspace.id,
    });
  } catch (err) {
    console.error("Failed to enqueue structure-finance-terms", err);
  }
}
```

- [ ] **Step 2:** En `updateAccount`, después del `db.update(accounts)...` exitoso (antes del
  `revalidatePath`), agregar sync del engagement base:

```ts
await ensureBaseEngagement(accountId, workspace.id, { fee, startDate });
```

- [ ] **Step 3:** Imports al tope de `app/actions/accounts.ts`:
  `accountFinance, accountConsultants` desde `@/lib/drizzle/schema`; `ensureBaseEngagement`
  desde `@/lib/finance/base-engagement`.

- [ ] **Step 4:** `npm run type-check` → PASS.
- [ ] **Step 5: Commit** `feat(finanzas): seed base engagement + finance row on account create/update`

---

## Task 4: Reframe del prompt + task de estructuración (no duplicar base, shares al base)

**Files:**
- Modify: `lib/ai/finance-terms-prompt.ts`
- Modify: `trigger/tasks/structure-finance-terms.ts`

- [ ] **Step 1:** En `FINANCE_TERMS_SYSTEM` agregar al bloque de reglas, antes de la última línea:

```
- El FEE MENSUAL BASE recurrente ya está cargado por separado (te lo paso como "Fee base"). NO generes un engagement para el fee base ni lo repitas. Estructurá ÚNICAMENTE: cargos extra o temporales (ej. implementación, setup), add-ons, descuentos, y cambios de fee a futuro respecto del base.
- Para los "shares" (reparto a consultores): si el reparto aplica al servicio/fee base, poné neurona "Fee mensual"; el sistema lo engancha al fee base.
```

- [ ] **Step 2:** En `structure-finance-terms.ts`, tras insertar engagements LLM y antes de
  `6d`, ubicar el engagement base para reasignar shares cuya neurona sea "Fee mensual".
  Cargar el engagement base una vez:

```ts
const [baseEngagement] = await db
  .select({ id: financeEngagements.id })
  .from(financeEngagements)
  .where(
    and(
      eq(financeEngagements.accountId, payload.accountId),
      eq(financeEngagements.source, "account_fee")
    )
  )
  .limit(1);
```

  En el loop de `shares`, calcular el `engagementId` destino: si la neurona del engagement
  actual (LLM) NO corresponde y el share está marcado para el base, usar `baseEngagement.id`.
  Implementación concreta: la task ya itera engagements LLM; para soportar shares al base,
  cuando `eng.neurona` (normalizada) sea "fee mensual", insertar el share con
  `engagementId: baseEngagement?.id ?? engagementId` y NO crear engagement LLM para esa
  neurona. Cambio mínimo: al inicio del loop `for (const eng of engagements)`, si
  `normalizeName(eng.neurona) === "fee mensual"` y existe `baseEngagement`, insertar solo sus
  `shares` (con `engagementId = baseEngagement.id`) y `continue` (saltar la creación del
  engagement y sus períodos).

```ts
if (normalizeName(neurona) === "fee mensual" && baseEngagement) {
  const baseShares = Array.isArray(eng.shares) ? eng.shares : [];
  for (const share of baseShares) {
    const consultantName = (share.consultantName ?? "").trim();
    const memberId = consultantName ? resolveMemberId(consultantName) : null;
    const shareType = share.type === "fixed" ? "fixed" : "percent";
    await db.insert(financeFeeShares).values({
      engagementId: baseEngagement.id,
      accountId: payload.accountId,
      workspaceId: payload.workspaceId,
      memberId,
      consultantNameRaw: consultantName || null,
      shareType,
      shareValue: String(share.value ?? 0),
      shareCurrency: share.currency ?? null,
      source: "llm",
    });
  }
  continue;
}
```

  NOTA: el borrado de shares `source="llm"` del base hay que sumarlo en 6a. Cambiar el
  delete de 6a para que también borre los fee shares LLM del engagement base (que no se
  borra por cascade porque el engagement base sobrevive):

```ts
// 6a-bis. Borrar fee shares LLM del engagement base (el engagement base no se borra).
if (baseEngagement) {
  await db
    .delete(financeFeeShares)
    .where(
      and(
        eq(financeFeeShares.engagementId, baseEngagement.id),
        eq(financeFeeShares.source, "llm")
      )
    );
}
```

  (Mover la carga de `baseEngagement` antes de 6a.)

- [ ] **Step 3:** `npm run type-check` → PASS. Recordar: requiere `npx trigger.dev deploy`
  (lo hace el workflow de GitHub al pushear a master; en esta rama no se despliega).

- [ ] **Step 4: Commit** `feat(finanzas): LLM structures only extras; base-fee shares attach to base engagement`

---

## Task 5: Cron mensual de generación

**Files:**
- Create: `trigger/tasks/generate-monthly-billing.ts`

- [ ] **Step 1: Crear la task programada** (patrón `schedules.task` ya usado en el repo):

```ts
import { schedules, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/drizzle/db";
import { workspaces } from "@/lib/drizzle/schema";
import { runMonthlyBilling } from "@/lib/finance/run-monthly-billing";

/** Día 1 de cada mes 06:00 UTC: regenera la facturación del mes en curso. */
export const generateMonthlyBilling = schedules.task({
  id: "generate-monthly-billing",
  cron: "0 6 1 * *",
  run: async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const rows = await db.select({ id: workspaces.id }).from(workspaces);
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const ws of rows) {
      const { created, updated } = await runMonthlyBilling(ws.id, year, month);
      totalCreated += created;
      totalUpdated += updated;
    }
    logger.info("Monthly billing generated", {
      year,
      month,
      workspaces: rows.length,
      created: totalCreated,
      updated: totalUpdated,
    });
    return { created: totalCreated, updated: totalUpdated };
  },
});
```

- [ ] **Step 2:** `npm run type-check` → PASS.
- [ ] **Step 3: Commit** `feat(finanzas): monthly billing cron`

---

## Task 6: Query `listFinanceAccountCards`

**Files:**
- Modify: `lib/queries/finance.ts`

- [ ] **Step 1:** Agregar tipo + query (importar `accountFinance`, `users` ya presentes/needed):

```ts
export interface FinanceAccountCard {
  id: string;
  name: string;
  ownerName: string | null;
  fee: number | null;
  hasNda: boolean;
  hasBillingData: boolean;
  termsStatus: string; // "none" | "structuring" | "ready" | "error"
  hasTermsText: boolean;
  closed: boolean;
}

export async function listFinanceAccountCards(
  workspaceId: string
): Promise<FinanceAccountCard[]> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      fee: accounts.fee,
      closedAt: accounts.closedAt,
      ownerName: users.fullName,
      ownerEmail: users.email,
      ndaStoragePath: accountFinance.ndaStoragePath,
      ndaUrl: accountFinance.ndaUrl,
      razonSocial: accountFinance.razonSocial,
      cuit: accountFinance.cuit,
      termsStatus: accountFinance.termsStatus,
      termsRawText: accountFinance.termsRawText,
    })
    .from(accounts)
    .leftJoin(users, eq(accounts.ownerId, users.id))
    .leftJoin(accountFinance, eq(accountFinance.accountId, accounts.id))
    .where(eq(accounts.workspaceId, workspaceId))
    .orderBy(asc(accounts.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ownerName: r.ownerName ?? r.ownerEmail ?? null,
    fee: r.fee == null ? null : Number(r.fee),
    hasNda: !!(r.ndaStoragePath || r.ndaUrl),
    hasBillingData: !!(r.razonSocial && r.cuit),
    termsStatus: r.termsStatus ?? "none",
    hasTermsText: !!(r.termsRawText && r.termsRawText.trim()),
    closed: r.closedAt != null,
  }));
}
```

  Asegurar import de `accountFinance` y `users` al tope (ya importa `users`, `accounts`;
  `accountFinance` ya está importado).

- [ ] **Step 2:** `npm run type-check` → PASS.
- [ ] **Step 3: Commit** `feat(finanzas): listFinanceAccountCards query`

---

## Task 7: Card + grid de cuentas (tab "Cuentas")

**Files:**
- Create: `components/finance/finance-account-card.tsx`
- Create: `components/finance/finance-accounts-grid.tsx`

- [ ] **Step 1: Card** (server-safe, link a detalle):

```tsx
import Link from "next/link";
import { AlertTriangle, FileWarning, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { FinanceAccountCard as CardData } from "@/lib/queries/finance";

function Alert({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400">
      <AlertTriangle size={11} aria-hidden />
      {label}
    </span>
  );
}

export function FinanceAccountCard({ account }: { account: CardData }) {
  const alerts: string[] = [];
  if (!account.hasNda) alerts.push("Falta NDA");
  if (!account.hasBillingData) alerts.push("Faltan datos de facturación");
  if (account.hasTermsText && account.termsStatus !== "ready")
    alerts.push("Términos sin estructurar");

  return (
    <Link href={`/app/finanzas/${account.id}`} className="block">
      <GlassCard className="p-5 h-full transition-colors hover:bg-white/30 dark:hover:bg-white/5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{account.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {account.ownerName ?? "Sin responsable"}
            </p>
          </div>
          {account.fee != null && (
            <span className="shrink-0 text-sm font-medium tabular-nums">
              USD {account.fee.toLocaleString("es-AR")}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {alerts.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <Sparkles size={11} aria-hidden />
              Completo
            </span>
          ) : (
            alerts.map((a) => <Alert key={a} label={a} />)
          )}
        </div>
      </GlassCard>
    </Link>
  );
}
```

  (Import `FileWarning` solo si se usa; quitarlo si no. Mantener imports usados.)

- [ ] **Step 2: Grid**:

```tsx
import { FinanceAccountCard } from "./finance-account-card";
import type { FinanceAccountCard as CardData } from "@/lib/queries/finance";

export function FinanceAccountsGrid({ accounts }: { accounts: CardData[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay cuentas. Creá una desde Portfolio y aparecerá acá.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {accounts.map((a) => (
        <FinanceAccountCard key={a.id} account={a} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** `npm run type-check` → PASS.
- [ ] **Step 4: Commit** `feat(finanzas): account cards grid with status alerts`

---

## Task 8: Tab "Cuentas" en FinanzasTabs + auto-gen en la page

**Files:**
- Modify: `components/finance/finanzas-tabs.tsx`
- Modify: `app/(protected)/app/finanzas/page.tsx`

- [ ] **Step 1:** En `finanzas-tabs.tsx`:
  - `type TabId = "accounts" | "billing" | "fx" | "honorarios";`
  - `TABS` con `{ id: "accounts", label: "Cuentas" }` primero.
  - Default `useState<TabId>(initialTab ?? "accounts")`.
  - Nueva prop `accountCards: FinanceAccountCard[]` (importar tipo) y render
    `{tab === "accounts" && <FinanceAccountsGrid accounts={accountCards} />}` (importar grid).
  - Ajustar el cómputo de `initialTab` para aceptar `"accounts"`.

- [ ] **Step 2:** En `finanzas/page.tsx`:
  - Importar `runMonthlyBilling` y `listFinanceAccountCards`.
  - Antes del `Promise.all`, auto-generar el mes visto:
    `await runMonthlyBilling(workspace.id, year, month);`
  - Agregar `listFinanceAccountCards(workspace.id)` al `Promise.all` y pasar el resultado
    como `accountCards` a `<FinanzasTabs>`.
  - Ampliar el parse de `initialTab` para `params.tab === "accounts"`.

- [ ] **Step 3:** `npm run type-check` && `npm run lint` → PASS.
- [ ] **Step 4: Commit** `feat(finanzas): Cuentas tab + auto-generate month on load`

---

## Task 9: Detalle financiero por cuenta `/app/finanzas/[accountId]`

**Files:**
- Create: `app/(protected)/app/finanzas/[accountId]/page.tsx`

- [ ] **Step 1: Crear la page** (server component, gateada; reusa componentes existentes,
  orden: docs → términos → facturación → equipo → A facturar de la cuenta). Estructura:

```tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceWithMember, getWorkspaceMembers } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import { db } from "@/lib/drizzle/db";
import { accountFinance, accountConsultants, users } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import {
  getAccountTerms,
  getFinanceMembers,
  getBillingForMonth,
} from "@/lib/queries/finance";
import { runMonthlyBilling } from "@/lib/finance/run-monthly-billing";
import { GlassCard } from "@/components/ui/glass-card";
import { FinanceDocs } from "@/components/finance/finance-docs";
import { TermsEditor } from "@/components/finance/terms-editor";
import { FinanceBillingForm } from "@/components/account-detail/finance-billing-form";
import { FinanceTeam } from "@/components/account-detail/finance-team";
import { AccountBillingPanel } from "@/components/finance/account-billing-panel";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function AccountFinancePage({ params, searchParams }: PageProps) {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const result = await getWorkspaceWithMember(userId);
  if (!result) redirect("/auth/login");
  const { workspace, member } = result;
  const canFinance =
    member.financeAdmin === true || member.role === "owner" || member.role === "admin";
  if (!canFinance) redirect("/unauthorized");

  const { accountId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? parseInt(sp.year, 10) : now.getFullYear();
  const month = sp.month ? parseInt(sp.month, 10) : now.getMonth() + 1;

  const account = await getAccountById(accountId, workspace.id, {
    userId,
    role: member.role,
  });
  if (!account) notFound();

  await runMonthlyBilling(workspace.id, year, month);

  const [financeRows, consultantRows, members, terms, financeMembers, allBilling] =
    await Promise.all([
      db.select().from(accountFinance).where(eq(accountFinance.accountId, accountId)).limit(1),
      db
        .select({
          id: accountConsultants.id,
          userId: accountConsultants.userId,
          neurona: accountConsultants.neurona,
          roleLabel: accountConsultants.roleLabel,
          fullName: users.fullName,
          email: users.email,
        })
        .from(accountConsultants)
        .innerJoin(users, eq(accountConsultants.userId, users.id))
        .where(eq(accountConsultants.accountId, accountId)),
      getWorkspaceMembers(workspace.id),
      getAccountTerms(accountId),
      getFinanceMembers(workspace.id),
      getBillingForMonth(workspace.id, year, month),
    ]);

  const finance = financeRows[0] ?? null;
  const consultants = consultantRows.map((r) => ({
    id: r.id,
    userId: r.userId,
    neurona: r.neurona,
    roleLabel: r.roleLabel,
    displayName: r.fullName ?? r.email,
    email: r.email,
  }));
  const billing = allBilling.filter((b) => b.accountId === accountId);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <Link
        href="/app/finanzas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={15} />
        Finanzas
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{account.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {account.ownerName ?? account.ownerEmail ?? "Sin responsable"}
          {consultants.length > 0 && (
            <> · {consultants.map((c) => c.displayName).join(", ")}</>
          )}
        </p>
      </div>

      <GlassCard className="p-6">
        <FinanceDocs
          accountId={accountId}
          nda={{
            fileName: finance?.ndaFileName ?? null,
            url: finance?.ndaUrl ?? null,
            hasDoc: !!(finance?.ndaStoragePath || finance?.ndaUrl),
          }}
          proposal={{
            fileName: finance?.proposalFileName ?? null,
            url: finance?.proposalUrl ?? null,
            hasDoc: !!(finance?.proposalStoragePath || finance?.proposalUrl),
          }}
          ndaExtractionStatus={finance?.ndaExtractionStatus ?? "none"}
          ndaExtractionError={finance?.ndaExtractionError ?? null}
        />
      </GlassCard>

      <GlassCard className="p-6">
        <TermsEditor accountId={accountId} terms={terms} members={financeMembers} />
      </GlassCard>

      <GlassCard className="p-6">
        <FinanceBillingForm accountId={accountId} finance={finance} />
      </GlassCard>

      <GlassCard className="p-6">
        <FinanceTeam
          accountId={accountId}
          consultants={consultants}
          members={members}
          services={workspace.services ?? []}
        />
      </GlassCard>

      <GlassCard className="p-6">
        <AccountBillingPanel
          accountId={accountId}
          accountName={account.name}
          year={year}
          month={month}
          billing={billing}
        />
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 2:** `npm run type-check` → PASS (depende de Task 10 para `AccountBillingPanel`).
- [ ] **Step 3: Commit** `feat(finanzas): per-account finance detail route` (junto con Task 10).

---

## Task 10: Panel "A facturar (esta cuenta)"

**Files:**
- Create: `components/finance/account-billing-panel.tsx`

- [ ] **Step 1:** Client component: tabla del mes filtrada para la cuenta + cambiar estado +
  agregar/eliminar cargo adicional (reusa `setBillingStatus`, `addBillingCharge`,
  `deleteBillingCharge` de `@/app/actions/finance`). Selector de mes vía
  `router.push('/app/finanzas/<id>?year=&month=')`. Basarse en la lógica de `billing-list.tsx`
  (toolbar de mes, fila por concepto con monto original/ARS, badge "adicional", total ARS,
  form de agregar cargo) pero recibiendo `billing: BillingRow[]` ya filtrado y con
  `accountId` fijo para los cargos. Encabezado `A facturar — {MONTHS[month]} {year}`.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  setBillingStatus,
  addBillingCharge,
  deleteBillingCharge,
  generateBillingForMonth,
} from "@/app/actions/finance";
import type { BillingRow } from "@/lib/queries/finance";

const MONTHS: Record<number, string> = {
  1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
  7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente", billed: "Facturado", paid: "Cobrado",
};
const arsFmt = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const inputClass =
  "rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";
const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed";

interface Props {
  accountId: string;
  accountName: string;
  year: number;
  month: number;
  billing: BillingRow[];
}

export function AccountBillingPanel({ accountId, year, month, billing }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCharge, setShowCharge] = useState(false);
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ARS");

  const totalArs = billing.reduce((s, r) => s + (r.amountArs ?? 0), 0);

  function nav(y: number, m: number) {
    router.push(`/app/finanzas/${accountId}?year=${y}&month=${m}`);
  }

  function handleStatus(id: string, status: "pending" | "billed" | "paid") {
    setError(null);
    startTransition(async () => {
      const res = await setBillingStatus({ id, status });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteBillingCharge({ id });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  function handleRegenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateBillingForMonth({ year, month });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!concept.trim()) return setError("Concepto requerido");
    if (isNaN(amt)) return setError("Monto inválido");
    startTransition(async () => {
      const res = await addBillingCharge({
        accountId, year, month, concept: concept.trim(), amount: amt, currency,
      });
      if (!res.success) { setError(res.error ?? "Error"); return; }
      setConcept(""); setAmount(""); setShowCharge(false); router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          A facturar — {MONTHS[month]} {year}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={month}
            disabled={isPending}
            onChange={(e) => nav(year, parseInt(e.target.value, 10))}
            className={`${inputClass} w-[130px]`}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{MONTHS[m]}</option>
            ))}
          </select>
          <input
            type="number" value={year} min={2000} max={2100} disabled={isPending}
            onChange={(e) => nav(parseInt(e.target.value, 10) || year, month)}
            className={`${inputClass} w-[80px]`}
          />
          <button type="button" onClick={() => setShowCharge((v) => !v)} disabled={isPending} className={ghostBtn}>
            <Plus size={13} aria-hidden /> Agregar cargo
          </button>
          <button type="button" onClick={handleRegenerate} disabled={isPending} className={ghostBtn}>
            <RefreshCw size={13} aria-hidden /> Regenerar
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {showCharge && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto" disabled={isPending} className={`${inputClass} min-w-[160px]`} />
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" placeholder="Monto" disabled={isPending} className={`${inputClass} w-[110px]`} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={isPending} className={inputClass}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
          <button type="submit" disabled={isPending} className={ghostBtn}>
            <Plus size={13} aria-hidden /> Agregar
          </button>
        </form>
      )}

      {billing.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin filas este mes.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b [border-color:var(--glass-border)]">
              <th className="py-2 text-left font-semibold text-muted-foreground">Concepto</th>
              <th className="py-2 text-right font-semibold text-muted-foreground">Original</th>
              <th className="py-2 text-right font-semibold text-muted-foreground">ARS</th>
              <th className="py-2 text-left font-semibold text-muted-foreground">Estado</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {billing.map((r) => (
              <tr key={r.id} className="border-b last:border-0 [border-color:var(--glass-border)]">
                <td className="py-2">
                  {r.concept}
                  {r.isAdditional && (
                    <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary">adicional</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.amountOriginal.toLocaleString("es-AR", { minimumFractionDigits: 2 })} {r.currencyOriginal}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.amountArs == null ? (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={11} aria-hidden /> TC pendiente
                    </span>
                  ) : arsFmt.format(r.amountArs)}
                </td>
                <td className="py-2">
                  <select
                    value={r.status} disabled={isPending}
                    onChange={(e) => handleStatus(r.id, e.target.value as "pending" | "billed" | "paid")}
                    className={inputClass}
                  >
                    {(["pending", "billed", "paid"] as const).map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-right">
                  {r.isAdditional && (
                    <button type="button" onClick={() => handleDelete(r.id)} disabled={isPending} aria-label="Eliminar cargo" className="text-muted-foreground hover:text-destructive disabled:opacity-50">
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t [border-color:var(--glass-border)]">
              <td className="py-2 font-semibold" colSpan={2}>Total ARS</td>
              <td className="py-2 text-right font-semibold tabular-nums">{arsFmt.format(totalArs)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** `npm run type-check` → PASS.
- [ ] **Step 3: Commit** `feat(finanzas): per-account billing panel` (junto con Task 9).

---

## Task 11: Interno de la cuenta — quitar FinanceSection, agregar consultores + términos

**Files:**
- Create: `components/account-detail/account-consultants-inline.tsx`
- Create: `components/account-detail/account-terms-field.tsx`
- Modify: `app/(protected)/app/accounts/[accountId]/page.tsx`

- [ ] **Step 1: Consultores inline** (client; reusa add/remove + selector de miembros):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { addAccountConsultant, removeAccountConsultant } from "@/app/actions/finance";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface Consultant {
  id: string;
  displayName: string;
}

interface Props {
  accountId: string;
  consultants: Consultant[];
  members: WorkspaceMemberWithUser[];
}

export function AccountConsultantsInline({ accountId, consultants, members }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await addAccountConsultant({ accountId, userId: selected, neurona: null, roleLabel: null });
      if (!res.success) setError(res.error ?? "Error");
      else { setSelected(""); router.refresh(); }
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeAccountConsultant({ accountId, id });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Consultores
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {consultants.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
            {c.displayName}
            <button type="button" onClick={() => remove(c.id)} disabled={isPending} aria-label={`Quitar ${c.displayName}`} className="hover:text-destructive disabled:opacity-50">
              <Trash2 size={11} aria-hidden />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <select
            value={selected} onChange={(e) => setSelected(e.target.value)} disabled={isPending}
            className="rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            aria-label="Agregar consultor"
          >
            <option value="">— Agregar —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.displayName}</option>
            ))}
          </select>
          <button type="button" onClick={add} disabled={isPending || !selected} aria-label="Agregar consultor" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
            <UserPlus size={13} aria-hidden />
          </button>
        </span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Términos field** (client; guarda raw text + dispara estructuración):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Sparkles } from "lucide-react";
import { saveTermsRawText, structureTerms } from "@/app/actions/finance-terms";

interface Props {
  accountId: string;
  initialText: string | null;
}

export function AccountTermsField({ accountId, initialText }: Props) {
  const router = useRouter();
  const [text, setText] = useState(initialText ?? "");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setStatus("idle"); setError(null);
    startTransition(async () => {
      const res = await saveTermsRawText({ accountId, rawText: text });
      if (!res.success) { setStatus("error"); setError(res.error ?? "Error"); return; }
      // Re-estructurar automáticamente al guardar.
      await structureTerms({ accountId });
      setStatus("saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus("idle"); }}
        placeholder="Modo de contratación y novedades. Ej: este mes aplica un descuento por…, el mes que viene se suma el cargo por…"
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-y"
        disabled={isPending}
      />
      <div className="flex items-center gap-3">
        <button
          type="button" onClick={save} disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50"
        >
          <Save size={13} aria-hidden />
          {isPending ? "Guardando…" : "Guardar términos"}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Sparkles size={12} aria-hidden /> Guardado · reestructurando
          </span>
        )}
        {status === "error" && error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modificar la page de la cuenta** (`accounts/[accountId]/page.tsx`):
  - Quitar el import y el render de `FinanceSection` (líneas 44 y 155-162).
  - Cargar consultores + términos cuando `canFinance`. Agregar a la consulta:

```tsx
import { accountFinance, accountConsultants, users as usersTable } from "@/lib/drizzle/schema";
import { AccountConsultantsInline } from "@/components/account-detail/account-consultants-inline";
import { AccountTermsField } from "@/components/account-detail/account-terms-field";
```

  Tras obtener `account`, si `canFinance`, cargar:

```tsx
const [consultantRows, financeRow] = canFinance
  ? await Promise.all([
      db
        .select({
          id: accountConsultants.id,
          fullName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(accountConsultants)
        .innerJoin(usersTable, eq(accountConsultants.userId, usersTable.id))
        .where(eq(accountConsultants.accountId, accountId)),
      db
        .select({ termsRawText: accountFinance.termsRawText })
        .from(accountFinance)
        .where(eq(accountFinance.accountId, accountId))
        .limit(1),
    ])
  : [[], []];
const consultants = consultantRows.map((r) => ({
  id: r.id,
  displayName: r.fullName ?? r.email,
}));
const termsText = (financeRow as { termsRawText: string | null }[])[0]?.termsRawText ?? null;
```

  - Reemplazar el bloque `{canFinance && <FinanceSection .../>}` por un GlassCard con
    consultores + términos:

```tsx
{canFinance && (
  <GlassCard className="p-6 mb-6 space-y-5">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold">Términos de contratación</h2>
      <Link href={`/app/finanzas/${accountId}`} className="text-xs text-primary hover:underline">
        Ver finanzas de la cuenta →
      </Link>
    </div>
    <AccountConsultantsInline accountId={accountId} consultants={consultants} members={members} />
    <AccountTermsField accountId={accountId} initialText={termsText} />
  </GlassCard>
)}
```

  (Verificar que `db`, `eq` ya están importados en la page — sí lo están.)

- [ ] **Step 4:** `npm run type-check` && `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(accounts): slim finance in account internal (consultores + términos)`

---

## Task 12: Formulario de creación — términos + consultores

**Files:**
- Modify: `app/(protected)/app/accounts/new/page.tsx`

- [ ] **Step 1:** Debajo del bloque de "Objetivos de la cuenta" agregar el textarea de términos:

```tsx
<div className="flex flex-col gap-1.5">
  <Label htmlFor="terms">Términos de Contratación</Label>
  <textarea
    id="terms"
    name="terms"
    rows={3}
    placeholder="Modo de contratación y condiciones. Ej: fee mensual + los primeros 3 meses se suma un cargo por implementación de CRM."
    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
  />
</div>
```

- [ ] **Step 2:** Junto al selector "Responsable", agregar selector múltiple de consultores
  (mismo set de `members`). Reemplazar el `div` de Responsable por una grilla de 2 columnas:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="ownerId">Responsable</Label>
    <select
      id="ownerId"
      name="ownerId"
      defaultValue={userId}
      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="">Sin responsable</option>
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>{m.displayName}</option>
      ))}
    </select>
  </div>
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="consultantIds">Consultores</Label>
    <select
      id="consultantIds"
      name="consultantIds"
      multiple
      className="flex w-full min-h-[42px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>{m.displayName}</option>
      ))}
    </select>
    <p className="text-xs text-muted-foreground">Ctrl/Cmd para elegir varios.</p>
  </div>
</div>
```

  (Eliminar el bloque previo de Responsable suelto.)

- [ ] **Step 3:** `npm run type-check` && `npm run lint` → PASS.
- [ ] **Step 4: Commit** `feat(accounts): terms + consultants on new account form`

---

## Task 13: Verificación final y limpieza

- [ ] **Step 1:** Confirmar que `components/account-detail/finance-section.tsx` ya no se
  importa en ningún lado: `grep -rn "finance-section" app components`. Si solo aparece su
  propia definición, dejarlo (no se borra; queda sin uso) o eliminarlo. Decisión: **eliminarlo**
  para no dejar código muerto, ya que su contenido se reusa directamente en la nueva page.

- [ ] **Step 2:** `npm run type-check` → PASS.
- [ ] **Step 3:** `npm run lint` → PASS (sin warnings nuevos).
- [ ] **Step 4:** `npm run build` → PASS.
- [ ] **Step 5: Commit** `chore(finanzas): remove dead finance-section; final checks`
- [ ] **Step 6:** Push de la rama.

---

## Self-review notes

- **Trigger deploy:** Tasks 4 y 5 tocan `trigger/tasks/*` → requieren `npx trigger.dev deploy`
  (auto al pushear a master vía workflow). En la rama feature no se despliega; verificar al
  mergear. Ver `feedback_trigger_dev_redeploy`.
- **Sin migración DDL:** `source="account_fee"` usa la columna `text` existente.
- **Permisos:** detalle por cuenta y campos en el interno gateados a finance-admin/owner/admin.
- **Doble conteo:** el LLM ya no emite el fee base; los shares "Fee mensual" se enganchan al
  engagement base; el delete de `source="llm"` no toca el base.
