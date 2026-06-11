# Cartera & Proyección Dinámica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Proyección" tab to Finanzas showing a portfolio (auto-sourced from accounts) and a live MRR projection vs breakeven, with editable what-if assumptions persisted per workspace.

**Architecture:** New Drizzle table `finance_projection_assumptions` (1 row/workspace). Pure projection math in `lib/finance/projection-model.ts` (verified by a `tsx` script — there is no test framework in this repo). A query layer derives portfolio rows from `accounts` + `finance_engagements` + active `finance_engagement_periods`. A client component renders three sections (Supuestos, Resultado with a hand-rolled SVG chart, Cartera table) and recalculates in-browser. Wired into the existing `FinanzasTabs`.

**Tech Stack:** Next.js 15 (App Router) + React 19, Drizzle ORM (Postgres/Supabase), Tailwind v4 + shadcn, `tsx` for the verification script.

**Spec:** `docs/superpowers/specs/2026-06-11-cartera-proyeccion-design.md`

**Gate (every task with code):** `npm run type-check` must pass. Final task also runs `npm run build`. Do NOT rely on `npm run lint` (no flat config) and do NOT run `npm run db:status` (broken `--dry-run`).

---

## File Structure

**Create:**
- `lib/drizzle/schema/finance_projection_assumptions.ts` — table definition
- `drizzle/migrations/<generated>/down.sql` — rollback
- `lib/finance/projection-model.ts` — pure math (months, baseActiveAt, computeProjection, MEP resolver)
- `scripts/verify-projection-model.ts` — assertion script run with `tsx`
- `lib/queries/projection.ts` — `getPortfolioForProjection`, `getProjectionAssumptions`, shared types
- `components/finance/proyeccion-chart.tsx` — SVG chart
- `components/finance/cartera-proyeccion.tsx` — main client component (3 sections)

**Modify:**
- `lib/drizzle/schema/index.ts` — export the new table
- `app/actions/finance.ts` — `upsertProjectionAssumptions` server action
- `app/(protected)/app/finanzas/page.tsx` — fetch portfolio + assumptions, pass props
- `components/finance/finanzas-tabs.tsx` — new "Proyección" tab

---

## Task 1: Schema + migration for `finance_projection_assumptions`

**Files:**
- Create: `lib/drizzle/schema/finance_projection_assumptions.ts`
- Modify: `lib/drizzle/schema/index.ts`
- Create: `drizzle/migrations/<generated>/down.sql`

- [ ] **Step 1: Create the schema file**

`lib/drizzle/schema/finance_projection_assumptions.ts`:

```ts
import { pgTable, timestamp, uuid, integer, numeric } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const financeProjectionAssumptions = pgTable(
  "finance_projection_assumptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    breakevenUsd: numeric("breakeven_usd", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    otrosIngresosUsd: numeric("otros_ingresos_usd", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    clientesNuevosMes: integer("clientes_nuevos_mes").notNull().default(0),
    ticketMedioNuevoUsd: numeric("ticket_medio_nuevo_usd", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    churnUsdMes: numeric("churn_usd_mes", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    horizonteMeses: integer("horizonte_meses").notNull().default(6),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export type FinanceProjectionAssumptions =
  typeof financeProjectionAssumptions.$inferSelect;
export type NewFinanceProjectionAssumptions =
  typeof financeProjectionAssumptions.$inferInsert;
```

- [ ] **Step 2: Export it from the schema index**

In `lib/drizzle/schema/index.ts`, add at the end:

```ts
export * from "./finance_projection_assumptions";
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new folder under `drizzle/migrations/` containing a `*.sql` that creates `finance_projection_assumptions`. Note the folder name (e.g. `0040_<slug>`).

- [ ] **Step 4: Create the down migration**

Create `drizzle/migrations/<generated-folder>/down.sql` (same folder the generate step produced):

```sql
DROP TABLE IF EXISTS "finance_projection_assumptions";
```

- [ ] **Step 5: Run the migration**

Run: `npm run db:migrate`
Expected: applies the new migration with no error. (Dev and prod share one Supabase DB, so this covers prod.)

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add lib/drizzle/schema/finance_projection_assumptions.ts lib/drizzle/schema/index.ts drizzle/migrations
git commit -m "feat(finanzas): tabla finance_projection_assumptions"
```

---

## Task 2: Pure projection model + verification script

**Files:**
- Create: `lib/finance/projection-model.ts`
- Create: `scripts/verify-projection-model.ts`

The model is pure (imports only `monthOffset` from `lib/finance/compute.ts`, which is itself pure) so it runs under `tsx` with no DB/Next runtime.

- [ ] **Step 1: Write the model**

`lib/finance/projection-model.ts`:

```ts
import { monthOffset } from "@/lib/finance/compute";

export type Estado = "Activo" | "En riesgo" | "Se va";

export interface PortfolioRow {
  accountId: string; // "" for manually-added what-if rows
  name: string;
  neurona: string;
  ticketUsd: number;
  estado: Estado;
  bajaMonth: string | null; // "YYYY-MM"
}

export interface Assumptions {
  breakevenUsd: number;
  otrosIngresosUsd: number;
  clientesNuevosMes: number;
  ticketMedioNuevoUsd: number;
  churnUsdMes: number;
  horizonteMeses: number; // 6 | 18
}

export interface MonthCol {
  key: string; // "YYYY-MM"
  label: string; // "Jun-26"
}

const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** Label like "Jun-26" for a 1-based month. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS_ES[month - 1]}-${String(year % 100).padStart(2, "0")}`;
}

/** {year,month} shifted by n months (month is 1-based). */
export function addMonth(
  year: number,
  month: number,
  n: number
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Projected-month columns: indices 1..count starting AFTER the base month. */
export function buildMonths(
  startYear: number,
  startMonth: number,
  count: number
): MonthCol[] {
  const out: MonthCol[] = [];
  for (let i = 1; i <= count; i++) {
    const { year, month } = addMonth(startYear, startMonth, i);
    out.push({ key: `${year}-${String(month).padStart(2, "0")}`, label: monthLabel(year, month) });
  }
  return out;
}

/** Month index (relative to base) at which a "YYYY-MM" baja takes effect; null if no baja. */
function bajaIndex(
  startYear: number,
  startMonth: number,
  bajaMonth: string | null
): number | null {
  if (!bajaMonth) return null;
  const by = parseInt(bajaMonth.slice(0, 4), 10);
  const bm = parseInt(bajaMonth.slice(5, 7), 10);
  if (Number.isNaN(by) || Number.isNaN(bm)) return null;
  return monthOffset(startYear, startMonth, by, bm);
}

/**
 * Sum of USD tickets present at the given month index (0 = base month).
 * A row is present if it has no baja, or the month index is at/before its baja
 * index (the client bills through its baja month inclusive, then disappears).
 */
export function baseActiveAtUsd(
  rows: PortfolioRow[],
  startYear: number,
  startMonth: number,
  monthIndex: number
): number {
  return rows.reduce((sum, r) => {
    const bi = bajaIndex(startYear, startMonth, r.bajaMonth);
    const present = bi === null ? true : monthIndex <= bi;
    return sum + (present ? r.ticketUsd || 0 : 0);
  }, 0);
}

export interface ProjectionResult {
  months: MonthCol[]; // projected months (indices 1..horizonte)
  mrrUsd: number[]; // MRR per projected month
  baseNowUsd: number; // active cartera at base month (excludes otros)
  mrrNowUsd: number; // baseNow + otros
  count: number; // number of rows
  ticketMedioUsd: number; // baseNow / count
  breakevenUsd: number;
  crossLabel: string | null; // label of first projected month >= breakeven
}

/** Core projection (USD). Ported from the reference compute()/activeAt(). */
export function computeProjection(
  rows: PortfolioRow[],
  a: Assumptions,
  startYear: number,
  startMonth: number
): ProjectionResult {
  const months = buildMonths(startYear, startMonth, a.horizonteMeses);
  const baseNowUsd = baseActiveAtUsd(rows, startYear, startMonth, 0);
  const mrrNowUsd = baseNowUsd + a.otrosIngresosUsd;
  const count = rows.length;
  const ticketMedioUsd = count ? baseNowUsd / count : 0;

  const mrrUsd: number[] = [];
  let crossLabel: string | null = null;
  for (let mi = 1; mi <= a.horizonteMeses; mi++) {
    const growth = (a.clientesNuevosMes * a.ticketMedioNuevoUsd - a.churnUsdMes) * mi;
    const v = a.otrosIngresosUsd + baseActiveAtUsd(rows, startYear, startMonth, mi) + growth;
    mrrUsd.push(v);
    if (crossLabel === null && v >= a.breakevenUsd) crossLabel = months[mi - 1].label;
  }

  return {
    months,
    mrrUsd,
    baseNowUsd,
    mrrNowUsd,
    count,
    ticketMedioUsd,
    breakevenUsd: a.breakevenUsd,
    crossLabel,
  };
}

export interface KnownFx {
  year: number;
  month: number;
  mepRate: number;
  ipcCoefficient: number;
}

/**
 * Build a MEP resolver for the ARS toggle.
 * - Month with a known rate → that mepRate.
 * - Month AFTER the latest known → latestMep compounded by the latest IPC
 *   coefficient once per month step ("MEP del mes + IPC para proyección").
 * - Otherwise (no data) → latest known mepRate, or null if there is no data at all.
 */
export function buildMepResolver(
  known: KnownFx[]
): (year: number, month: number) => number | null {
  if (known.length === 0) return () => null;
  const map = new Map<string, KnownFx>();
  let latest = known[0];
  for (const k of known) {
    map.set(`${k.year}-${k.month}`, k);
    if (k.year * 12 + k.month > latest.year * 12 + latest.month) latest = k;
  }
  return (year: number, month: number) => {
    const hit = map.get(`${year}-${month}`);
    if (hit) return hit.mepRate;
    const steps = monthOffset(latest.year, latest.month, year, month);
    if (steps <= 0) return latest.mepRate;
    const ipc = latest.ipcCoefficient || 1;
    return latest.mepRate * Math.pow(ipc, steps);
  };
}
```

- [ ] **Step 2: Write the verification script**

`scripts/verify-projection-model.ts`:

```ts
import {
  baseActiveAtUsd,
  computeProjection,
  buildMonths,
  buildMepResolver,
  type PortfolioRow,
  type Assumptions,
} from "@/lib/finance/projection-model";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

const rows: PortfolioRow[] = [
  { accountId: "a", name: "A", neurona: "IC", ticketUsd: 1000, estado: "Activo", bajaMonth: null },
  { accountId: "b", name: "B", neurona: "Growth", ticketUsd: 500, estado: "Se va", bajaMonth: "2026-06" },
];

// Base month = Jun 2026 (start 2026,6).
check("baseActiveAt month0 includes B (baja Jun)", baseActiveAtUsd(rows, 2026, 6, 0) === 1500);
check("baseActiveAt month1 drops B (gone after Jun)", baseActiveAtUsd(rows, 2026, 6, 1) === 1000);

const a: Assumptions = {
  breakevenUsd: 2000,
  otrosIngresosUsd: 0,
  clientesNuevosMes: 1,
  ticketMedioNuevoUsd: 600,
  churnUsdMes: 0,
  horizonteMeses: 6,
};
const R = computeProjection(rows, a, 2026, 6);
check("6 projected months", R.months.length === 6 && R.mrrUsd.length === 6);
check("first projected label is Jul-26", R.months[0].label === "Jul-26");
check("mrrNow = baseNow + otros", R.mrrNowUsd === 1500);
// month1 (Jul): base 1000 + growth (1*600)*1 = 1600 ; month2: 1000 + 1200 = 2200 >= 2000
check("month1 MRR = 1600", R.mrrUsd[0] === 1600);
check("crosses breakeven at Ago-26", R.crossLabel === "Ago-26");

check("buildMonths count", buildMonths(2026, 12, 2)[0].label === "Ene-27");

const mep = buildMepResolver([
  { year: 2026, month: 6, mepRate: 1000, ipcCoefficient: 1.05 },
]);
check("known month MEP", mep(2026, 6) === 1000);
check("forward MEP compounds IPC once", Math.abs((mep(2026, 7) ?? 0) - 1050) < 1e-6);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll projection-model checks passed.");
```

- [ ] **Step 3: Run the verification script (expect PASS)**

Run: `npx tsx scripts/verify-projection-model.ts`
Expected: prints `ok` lines and `All projection-model checks passed.`, exit 0. If any check fails, fix `projection-model.ts` until it passes.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/projection-model.ts scripts/verify-projection-model.ts
git commit -m "feat(finanzas): modelo puro de proyeccion + verificacion"
```

---

## Task 3: Portfolio + assumptions queries

**Files:**
- Create: `lib/queries/projection.ts`

This reuses `monthBounds`/`isActiveInMonth` from `lib/finance/compute.ts` and `getFxRatesMap` from `lib/queries/finance.ts`.

- [ ] **Step 1: Write the queries**

`lib/queries/projection.ts`:

```ts
import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accounts,
  financeEngagements,
  financeEngagementPeriods,
  financeProjectionAssumptions,
} from "@/lib/drizzle/schema";
import { getFxRatesMap } from "@/lib/queries/finance";
import { isActiveInMonth, monthBounds } from "@/lib/finance/compute";
import type {
  PortfolioRow,
  Assumptions,
  Estado,
} from "@/lib/finance/projection-model";

/**
 * One portfolio row per non-closed account. ticketUsd = sum of active engagement
 * period fees (ARS fees converted to USD at the current month's MEP). Neurona =
 * the engagement contributing the largest USD fee.
 */
export async function getPortfolioForProjection(
  workspaceId: string,
  year: number,
  month: number
): Promise<PortfolioRow[]> {
  const accts = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      endDate: accounts.endDate,
      healthSignal: accounts.healthSignal,
    })
    .from(accounts)
    .where(and(eq(accounts.workspaceId, workspaceId), isNull(accounts.closedAt)));

  if (accts.length === 0) return [];
  const accountIds = accts.map((a) => a.id);

  const engs = await db
    .select({
      id: financeEngagements.id,
      accountId: financeEngagements.accountId,
      neurona: financeEngagements.neurona,
    })
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.workspaceId, workspaceId),
        eq(financeEngagements.status, "active"),
        inArray(financeEngagements.accountId, accountIds)
      )
    );

  const engIds = engs.map((e) => e.id);
  const periods = engIds.length
    ? await db
        .select({
          engagementId: financeEngagementPeriods.engagementId,
          fromDate: financeEngagementPeriods.fromDate,
          toDate: financeEngagementPeriods.toDate,
          fee: financeEngagementPeriods.fee,
          currency: financeEngagementPeriods.currency,
        })
        .from(financeEngagementPeriods)
        .where(inArray(financeEngagementPeriods.engagementId, engIds))
    : [];

  const fxMap = await getFxRatesMap(workspaceId, { year, month }, { year, month });
  const mep = fxMap.get(`${year}-${month}`)?.mepRate ?? null;

  // engagementId -> { neurona, accountId }
  const engById = new Map(engs.map((e) => [e.id, e]));
  // accountId -> { ticketUsd, bestNeurona, bestFee }
  const agg = new Map<string, { ticketUsd: number; neurona: string; bestFee: number }>();

  for (const p of periods) {
    if (!isActiveInMonth(p.fromDate, p.toDate, year, month)) continue;
    const eng = engById.get(p.engagementId);
    if (!eng) continue;
    const feeNum = Number(p.fee);
    const usd =
      p.currency === "USD" ? feeNum : mep && mep > 0 ? feeNum / mep : 0;
    const cur = agg.get(eng.accountId) ?? { ticketUsd: 0, neurona: "Otro", bestFee: 0 };
    cur.ticketUsd += usd;
    if (usd > cur.bestFee) {
      cur.bestFee = usd;
      cur.neurona = eng.neurona || "Otro";
    }
    agg.set(eng.accountId, cur);
  }

  const { start } = monthBounds(year, month);

  return accts.map((a): PortfolioRow => {
    const ag = agg.get(a.id);
    const bajaFuture = !!a.endDate && a.endDate >= start;
    let estado: Estado = "Activo";
    if (bajaFuture) estado = "Se va";
    else if (a.healthSignal === "red") estado = "En riesgo";
    return {
      accountId: a.id,
      name: a.name,
      neurona: ag?.neurona ?? "Otro",
      ticketUsd: Math.round((ag?.ticketUsd ?? 0) * 100) / 100,
      estado,
      bajaMonth: a.endDate ? a.endDate.slice(0, 7) : null,
    };
  });
}

const DEFAULT_ASSUMPTIONS: Assumptions = {
  breakevenUsd: 0,
  otrosIngresosUsd: 0,
  clientesNuevosMes: 0,
  ticketMedioNuevoUsd: 0,
  churnUsdMes: 0,
  horizonteMeses: 6,
};

export async function getProjectionAssumptions(
  workspaceId: string
): Promise<Assumptions> {
  const [row] = await db
    .select()
    .from(financeProjectionAssumptions)
    .where(eq(financeProjectionAssumptions.workspaceId, workspaceId))
    .limit(1);
  if (!row) return { ...DEFAULT_ASSUMPTIONS };
  return {
    breakevenUsd: Number(row.breakevenUsd),
    otrosIngresosUsd: Number(row.otrosIngresosUsd),
    clientesNuevosMes: row.clientesNuevosMes,
    ticketMedioNuevoUsd: Number(row.ticketMedioNuevoUsd),
    churnUsdMes: Number(row.churnUsdMes),
    horizonteMeses: row.horizonteMeses,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/projection.ts
git commit -m "feat(finanzas): queries de cartera y supuestos de proyeccion"
```

---

## Task 4: `upsertProjectionAssumptions` server action

**Files:**
- Modify: `app/actions/finance.ts`

- [ ] **Step 1: Add the import**

In `app/actions/finance.ts`, add `financeProjectionAssumptions` to the existing schema import block (the `from "@/lib/drizzle/schema"` import around lines 6-14):

```ts
import {
  accounts,
  accountFinance,
  accountConsultants,
  fxRates,
  billingRecords,
  memberCompensation,
  workspaceMembers,
  financeProjectionAssumptions,
} from "@/lib/drizzle/schema";
```

- [ ] **Step 2: Add the action at the end of the file**

Append to `app/actions/finance.ts`:

```ts
export async function upsertProjectionAssumptions(input: {
  breakevenUsd: number;
  otrosIngresosUsd: number;
  clientesNuevosMes: number;
  ticketMedioNuevoUsd: number;
  churnUsdMes: number;
  horizonteMeses: number;
}): Promise<R> {
  try {
    const { workspaceId, userId } = await requireFinanceWorkspace();
    const horizonte = input.horizonteMeses === 18 ? 18 : 6;
    const num = (n: number) => (Number.isFinite(n) ? n : 0).toString();
    await db
      .insert(financeProjectionAssumptions)
      .values({
        workspaceId,
        breakevenUsd: num(input.breakevenUsd),
        otrosIngresosUsd: num(input.otrosIngresosUsd),
        clientesNuevosMes: Math.trunc(input.clientesNuevosMes) || 0,
        ticketMedioNuevoUsd: num(input.ticketMedioNuevoUsd),
        churnUsdMes: num(input.churnUsdMes),
        horizonteMeses: horizonte,
        updatedByUserId: userId,
      })
      .onConflictDoUpdate({
        target: financeProjectionAssumptions.workspaceId,
        set: {
          breakevenUsd: num(input.breakevenUsd),
          otrosIngresosUsd: num(input.otrosIngresosUsd),
          clientesNuevosMes: Math.trunc(input.clientesNuevosMes) || 0,
          ticketMedioNuevoUsd: num(input.ticketMedioNuevoUsd),
          churnUsdMes: num(input.churnUsdMes),
          horizonteMeses: horizonte,
          updatedByUserId: userId,
          updatedAt: new Date(),
        },
      });
    revalidatePath("/app/finanzas");
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/finance.ts
git commit -m "feat(finanzas): action upsertProjectionAssumptions"
```

---

## Task 5: SVG projection chart component

**Files:**
- Create: `components/finance/proyeccion-chart.tsx`

Ported from the reference `drawProj()`. Pure presentational; renders an inline `<svg>`. Colors use the app's gold/positive/negative tokens via literal hex matching the existing finance theme (the reference's palette), kept inside the SVG (SVG attributes are not "inline styles" in the CLAUDE.md sense — that rule targets HTML `style={}`; the chart has no HTML style props).

- [ ] **Step 1: Write the chart**

`components/finance/proyeccion-chart.tsx`:

```tsx
"use client";

interface Props {
  labels: string[];
  values: number[]; // MRR per projected month (already in display currency)
  breakeven: number;
  fmt: (n: number) => string;
}

const GOLD = "#e8b04b";
const POS = "#46c69a";
const NEG = "#f0656a";
const BLUE = "#5b9ddb";

export function ProyeccionChart({ labels, values, breakeven, fmt }: Props) {
  const W = 960;
  const H = 300;
  const pl = 54;
  const pr = 16;
  const pt = 16;
  const pb = 38;
  const iw = W - pl - pr;
  const ih = H - pt - pb;

  const allv = [...values, breakeven, 0];
  const maxv = Math.max(...allv) * 1.08 || 1;
  const minv = 0;
  const n = labels.length;
  const X = (i: number) => pl + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v: number) => pt + ih - ((v - minv) / (maxv - minv)) * ih;
  const step = maxv > 110000 ? 25000 : maxv > 60000 ? 15000 : 10000;

  const gridlines: number[] = [];
  for (let gv = 0; gv <= maxv; gv += step) gridlines.push(gv);

  let line = "";
  let area = `M${X(0)} ${Y(0)} `;
  values.forEach((v, i) => {
    line += `${i ? "L" : "M"}${X(i)} ${Y(v)} `;
    area += `L${X(i)} ${Y(v)} `;
  });
  if (values.length) area += `L${X(values.length - 1)} ${Y(0)} Z`;
  const everyN = n > 8 ? 3 : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      fontFamily="var(--font-geist-mono, monospace)"
    >
      {gridlines.map((gv) => (
        <g key={`g${gv}`}>
          <line x1={pl} y1={Y(gv)} x2={W - pr} y2={Y(gv)} stroke="rgba(255,255,255,.06)" />
          <text x={pl - 9} y={Y(gv) + 4} fill="#8b9bb2" fontSize="11" textAnchor="end">
            {Math.round(gv / 1000)}k
          </text>
        </g>
      ))}
      <line x1={pl} y1={Y(breakeven)} x2={W - pr} y2={Y(breakeven)} stroke={BLUE} strokeDasharray="6 5" strokeWidth="1.5" />
      <text x={W - pr} y={Y(breakeven) - 6} fill={BLUE} fontSize="11" textAnchor="end">
        breakeven {fmt(breakeven)}
      </text>
      {values.length > 0 && (
        <>
          <path d={area} fill="rgba(232,176,75,.10)" />
          <path d={line} fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinejoin="round" />
          {values.map((v, i) => (
            <g key={`p${i}`}>
              <circle cx={X(i)} cy={Y(v)} r="3.6" fill={v >= breakeven ? POS : NEG} stroke="#0b0e13" strokeWidth="1.5" />
              {(i % everyN === 0 || i === n - 1) && (
                <text x={X(i)} y={H - 11} fill="#8b9bb2" fontSize="10.5" textAnchor="middle">
                  {labels[i]}
                </text>
              )}
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/finance/proyeccion-chart.tsx
git commit -m "feat(finanzas): chart SVG de proyeccion"
```

---

## Task 6: `CarteraProyeccion` client component

**Files:**
- Create: `components/finance/cartera-proyeccion.tsx`

- [ ] **Step 1: Write the component**

`components/finance/cartera-proyeccion.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { ProyeccionChart } from "@/components/finance/proyeccion-chart";
import { upsertProjectionAssumptions } from "@/app/actions/finance";
import {
  computeProjection,
  buildMepResolver,
  type PortfolioRow,
  type Assumptions,
  type Estado,
} from "@/lib/finance/projection-model";

interface KnownFxRow {
  year: number;
  month: number;
  mepRate: number;
  ipcCoefficient: number;
}

interface Props {
  portfolio: PortfolioRow[];
  assumptions: Assumptions;
  rates: KnownFxRow[];
  baseYear: number;
  baseMonth: number;
}

const NEURONAS = ["IC", "Growth", "Marketing", "Innovación", "People", "Growth/Mkt", "Otro"];
const ESTADOS: Estado[] = ["Activo", "En riesgo", "Se va"];

const fmtUsd = (n: number) =>
  (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-AR");

export function CarteraProyeccion({ portfolio, assumptions, rates, baseYear, baseMonth }: Props) {
  const [rows, setRows] = useState<PortfolioRow[]>(portfolio);
  const [a, setA] = useState<Assumptions>(assumptions);
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string>("");

  const mepResolver = useMemo(() => buildMepResolver(rates), [rates]);

  const R = useMemo(
    () => computeProjection(rows, a, baseYear, baseMonth),
    [rows, a, baseYear, baseMonth]
  );

  // Convert a USD figure for the base month / a projected month to display currency.
  const toDisplay = (usd: number, key: string | null): number => {
    if (currency === "USD") return usd;
    let mep: number | null;
    if (key) {
      const y = parseInt(key.slice(0, 4), 10);
      const m = parseInt(key.slice(5, 7), 10);
      mep = mepResolver(y, m);
    } else {
      mep = mepResolver(baseYear, baseMonth);
    }
    return mep ? usd * mep : usd;
  };

  const fmt = currency === "USD" ? fmtUsd : (n: number) => fmtUsd(n); // same formatter, ARS shown as plain pesos

  const chartValues = R.mrrUsd.map((v, i) => toDisplay(v, R.months[i].key));
  const chartBreakeven = toDisplay(R.breakevenUsd, null);

  const mrrNowDisp = toDisplay(R.mrrNowUsd, null);
  const ticketMedioDisp = toDisplay(R.ticketMedioUsd, null);
  const gapDisp = mrrNowDisp - chartBreakeven;
  const endUsd = R.mrrUsd[R.mrrUsd.length - 1] ?? 0;
  const endDisp = toDisplay(endUsd, R.months[R.months.length - 1]?.key ?? null);
  const ebitda = endDisp - chartBreakeven;

  const setAssum = (k: keyof Assumptions, v: number) =>
    setA((prev) => ({ ...prev, [k]: v }));

  const updRow = (i: number, k: keyof PortfolioRow, v: string) =>
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        switch (k) {
          case "ticketUsd":
            return { ...r, ticketUsd: Number(v) || 0 };
          case "bajaMonth":
            return { ...r, bajaMonth: v ? v : null };
          case "name":
            return { ...r, name: v };
          case "neurona":
            return { ...r, neurona: v };
          case "estado":
            return { ...r, estado: v as Estado };
          default:
            return r;
        }
      })
    );

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { accountId: "", name: "", neurona: "IC", ticketUsd: 0, estado: "Activo", bajaMonth: null },
    ]);
  const delRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const restore = () => setRows(portfolio);

  const save = () =>
    startTransition(async () => {
      const res = await upsertProjectionAssumptions(a);
      setSaved(res.success ? "Guardado ✓" : res.error ?? "Error");
      setTimeout(() => setSaved(""), 2500);
    });

  const cardCls = "rounded-xl border border-border/60 bg-card/40 p-4";
  const inputCls =
    "w-full rounded-md border border-border/60 bg-background px-2.5 py-2 text-sm tabular-nums outline-none focus:border-primary";
  const labelCls = "mb-1.5 block text-[11px] uppercase tracking-wide text-muted-foreground";

  return (
    <div className="space-y-8">
      {/* ① Supuestos */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Supuestos de proyección</h2>
          <p className="text-sm text-muted-foreground">
            Estos diales gobiernan el crecimiento por encima de tu cartera. Las bajas se definen
            cliente por cliente en la tabla.
          </p>
        </div>
        <div className={cardCls}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className={labelCls}>Breakeven (USD/mes)</label>
              <input className={inputCls} type="number" value={a.breakevenUsd}
                onChange={(e) => setAssum("breakevenUsd", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Otros ingresos rec. (USD)</label>
              <input className={inputCls} type="number" value={a.otrosIngresosUsd}
                onChange={(e) => setAssum("otrosIngresosUsd", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Clientes nuevos / mes</label>
              <input className={inputCls} type="number" value={a.clientesNuevosMes}
                onChange={(e) => setAssum("clientesNuevosMes", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Ticket medio nuevo (USD)</label>
              <input className={inputCls} type="number" value={a.ticketMedioNuevoUsd}
                onChange={(e) => setAssum("ticketMedioNuevoUsd", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Churn adicional (USD/mes)</label>
              <input className={inputCls} type="number" value={a.churnUsdMes}
                onChange={(e) => setAssum("churnUsdMes", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Horizonte</label>
              <div className="inline-flex w-full overflow-hidden rounded-md border border-border/60">
                {[6, 18].map((h) => (
                  <button key={h} type="button"
                    onClick={() => setAssum("horizonteMeses", h)}
                    className={cn(
                      "flex-1 px-2 py-2 text-xs font-medium transition-colors",
                      a.horizonteMeses === h
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}>
                    {h === 6 ? "H2 2026" : "hasta dic-27"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={save} disabled={pending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {pending ? "Guardando…" : "Guardar supuestos"}
            </button>
            <span className="text-xs text-muted-foreground">{saved}</span>
          </div>
        </div>
      </section>

      {/* ② Resultado */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Resultado</h2>
          <div className="inline-flex overflow-hidden rounded-md border border-border/60">
            {(["USD", "ARS"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  currency === c ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"
                )}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className={cardCls}>
          <ProyeccionChart labels={R.months.map((m) => m.label)} values={chartValues} breakeven={chartBreakeven} fmt={fmt} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi label={`MRR hoy (${currency})`} value={fmt(mrrNowDisp)} meta="cartera + otros"
            tone={mrrNowDisp >= chartBreakeven ? "pos" : "neg"} />
          <Kpi label="Clientes activos" value={String(R.count)} meta="en cartera" />
          <Kpi label="Ticket medio" value={fmt(ticketMedioDisp)} meta="MRR ÷ clientes" tone="gold" />
          <Kpi label="Gap a breakeven" value={(gapDisp >= 0 ? "+" : "") + fmt(gapDisp)} meta="MRR − breakeven"
            tone={gapDisp >= 0 ? "pos" : "neg"} />
          <Kpi label="Cruza breakeven"
            value={mrrNowDisp >= chartBreakeven ? "Ya" : R.crossLabel ?? "No en rango"}
            meta="primer mes ≥ BE"
            tone={mrrNowDisp >= chartBreakeven || R.crossLabel ? "pos" : "neg"} />
          <Kpi label="MRR fin horizonte" value={fmt(endDisp)}
            meta={`EBITDA ${ebitda >= 0 ? "+" : ""}${fmt(ebitda)}/mes`}
            tone={endDisp >= chartBreakeven ? "pos" : "neg"} />
        </div>
      </section>

      {/* ③ Cartera */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Cartera de clientes</h2>
            <p className="text-sm text-muted-foreground">
              Datos reales de tus cuentas. Editá para simular escenarios — no modifica las cuentas.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addRow}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              + Agregar
            </button>
            <button type="button" onClick={restore}
              className="rounded-md border border-border/60 px-3 py-1.5 text-sm hover:border-primary">
              ↺ Restaurar desde cuentas
            </button>
          </div>
        </div>
        <div className={cardCls}>
          <div className="mb-2 text-sm text-muted-foreground">
            {R.count} clientes · MRR cartera{" "}
            <b className="text-foreground">{fmt(toDisplay(R.baseNowUsd, null))}</b>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Cliente</th>
                  <th className="pb-2 pr-2 font-medium">Neurona</th>
                  <th className="pb-2 pr-2 font-medium">Ticket USD/mes</th>
                  <th className="pb-2 pr-2 font-medium">Estado</th>
                  <th className="pb-2 pr-2 font-medium">Mes de baja</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.accountId}-${i}`} className="border-t border-border/50">
                    <td className="py-1 pr-2">
                      <input className={inputCls} value={r.name} onChange={(e) => updRow(i, "name", e.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <select className={inputCls} value={r.neurona} onChange={(e) => updRow(i, "neurona", e.target.value)}>
                        {NEURONAS.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                        {!NEURONAS.includes(r.neurona) && <option value={r.neurona}>{r.neurona}</option>}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input className={cn(inputCls, "text-right")} type="number" value={r.ticketUsd}
                        onChange={(e) => updRow(i, "ticketUsd", e.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <select className={inputCls} value={r.estado} onChange={(e) => updRow(i, "estado", e.target.value)}>
                        {ESTADOS.map((es) => (
                          <option key={es} value={es}>{es}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input className={inputCls} placeholder="YYYY-MM" value={r.bajaMonth ?? ""}
                        onChange={(e) => updRow(i, "bajaMonth", e.target.value.trim() || "")} />
                    </td>
                    <td className="py-1 text-right">
                      <button type="button" onClick={() => delRow(i)}
                        className="px-2 text-muted-foreground hover:text-destructive">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          El cliente factura hasta su mes de baja inclusive y desaparece después. ARS usa el MEP del mes
          (e IPC para meses futuros). Herramienta de decisión, no asesoramiento financiero formal.
        </p>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "pos" | "neg" | "gold";
}) {
  const toneCls =
    tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-rose-500" : tone === "gold" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{meta}</div>
    </div>
  );
}
```

Note: `updRow` is type-safe via the `switch` (no computed-key spread over the union), normalizes an empty `bajaMonth` to `null`, and narrows `estado` with `as Estado` (the select only emits valid `Estado` values — no `any`, no `ts-expect-error`).

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS. (If `Estado` import is unused after edits, remove it from the import.)

- [ ] **Step 3: Commit**

```bash
git add components/finance/cartera-proyeccion.tsx
git commit -m "feat(finanzas): componente CarteraProyeccion (what-if)"
```

---

## Task 7: Wire the tab into the page

**Files:**
- Modify: `components/finance/finanzas-tabs.tsx`
- Modify: `app/(protected)/app/finanzas/page.tsx`

- [ ] **Step 1: Extend `FinanzasTabs`**

In `components/finance/finanzas-tabs.tsx`:

Add imports at the top (after the existing component imports):

```tsx
import { CarteraProyeccion } from "@/components/finance/cartera-proyeccion";
import type { PortfolioRow, Assumptions } from "@/lib/finance/projection-model";
```

Extend the `Props` interface with the new fields:

```tsx
  members: Array<{ userId: string; name: string }>;
  portfolio: PortfolioRow[];
  assumptions: Assumptions;
  baseYear: number;
  baseMonth: number;
  initialTab?: TabId;
```

Extend the `TabId` type and `TABS`:

```tsx
type TabId = "accounts" | "billing" | "fx" | "honorarios" | "proyeccion";

const TABS: { id: TabId; label: string }[] = [
  { id: "accounts", label: "Cuentas" },
  { id: "billing", label: "A facturar" },
  { id: "fx", label: "TC / IPC" },
  { id: "honorarios", label: "Honorarios" },
  { id: "proyeccion", label: "Proyección" },
];
```

Destructure the new props in the function signature (add `portfolio, assumptions, baseYear, baseMonth`), and render the new tab after the honorarios block:

```tsx
      {tab === "proyeccion" && (
        <CarteraProyeccion
          portfolio={portfolio}
          assumptions={assumptions}
          rates={rates}
          baseYear={baseYear}
          baseMonth={baseMonth}
        />
      )}
```

(`rates` is already a prop of `FinanzasTabs` — `FxRateRow[]` has `year, month, mepRate, ipcCoefficient`, matching `CarteraProyeccion`'s `KnownFxRow`.)

- [ ] **Step 2: Fetch data in the page**

In `app/(protected)/app/finanzas/page.tsx`:

Add imports:

```ts
import {
  getPortfolioForProjection,
  getProjectionAssumptions,
} from "@/lib/queries/projection";
```

Add the two fetches to the existing `Promise.all` (extend the destructured array and the calls):

```ts
  const [
    billing,
    rates,
    history,
    accountsList,
    accountCards,
    honorarios,
    compensationRows,
    portfolio,
    assumptions,
  ] = await Promise.all([
    getBillingForMonth(workspace.id, year, month),
    listFxRates(workspace.id),
    getBillingHistory(workspace.id),
    listFinanceAccounts(workspace.id),
    listFinanceAccountCards(workspace.id),
    computeHonorarios(workspace.id, year, month),
    listMemberCompensation(workspace.id),
    getPortfolioForProjection(workspace.id, year, month),
    getProjectionAssumptions(workspace.id),
  ]);
```

Extend the `initialTab` guard to accept `"proyeccion"`:

```ts
  const initialTab =
    params.tab === "fx" ||
    params.tab === "honorarios" ||
    params.tab === "billing" ||
    params.tab === "accounts" ||
    params.tab === "proyeccion"
      ? params.tab
      : undefined;
```

Pass the new props to `<FinanzasTabs>`:

```tsx
      <FinanzasTabs
        year={year}
        month={month}
        billing={billing}
        rates={rates}
        history={history}
        accounts={accountsList}
        accountCards={accountCards}
        honorarios={honorarios}
        compensationRows={compensationRows}
        members={members}
        portfolio={portfolio}
        assumptions={assumptions}
        baseYear={year}
        baseMonth={month}
        initialTab={initialTab}
      />
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds with no type/route errors.

- [ ] **Step 5: Commit**

```bash
git add components/finance/finanzas-tabs.tsx "app/(protected)/app/finanzas/page.tsx"
git commit -m "feat(finanzas): pestana Proyeccion en Finanzas"
```

---

## Final verification

- [ ] `npx tsx scripts/verify-projection-model.ts` → all checks pass
- [ ] `npm run type-check` → pass
- [ ] `npm run build` → pass
- [ ] Manual: open `/app/finanzas` as a finance admin, "Proyección" tab loads with real accounts, editing supuestos + "Guardar" persists across reload, USD/ARS toggle changes figures, "Restaurar desde cuentas" resets the table, chart renders and breakeven crossing matches the KPI.

---

## Notes for the implementer

- **Migration numbering:** the generate step picks the next number automatically; just create `down.sql` in whatever folder it produces. Per project memory, dev and prod share one Supabase DB, so `db:migrate` is the only migration step (no `db:migrate:prod`).
- **Trigger.dev:** this feature touches no `trigger/` tasks, so no deploy is needed.
- **No test framework:** the only automated check for the math is `scripts/verify-projection-model.ts` via `tsx`. Everything else is gated by `type-check` + `build`.
- **ARS model:** the what-if view converts the whole USD MRR by the month's projected MEP (IPC-compounded forward), intentionally simpler than per-engagement `mep_ipc` compounding — documented in the spec §10.
