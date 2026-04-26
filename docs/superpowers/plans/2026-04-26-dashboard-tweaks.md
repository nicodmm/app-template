# Dashboard Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 6 user-driven dashboard improvements (LTV hint, health treemap, clickable opportunities/industries/sizes, lifetime activity, global filters) plus a layout reshuffle.

**Architecture:** Server-Component dashboard page reads `service`/`owner` searchParams alongside the existing period; passes them into a single `DashboardScope`. Backend filters apply at the snapshot query level so every metric and drill-down stays consistent. Drilldowns share a new `<DashboardAccountsListDrawer>` reading via a new server action. Health distribution swaps the bar+pills for a recharts `<Treemap>`.

**Tech Stack:** Next.js 15 App Router, React 19, Drizzle ORM + Postgres, recharts (already a dep — `Treemap` ships in the same package as `BarChart`), Tailwind + glass tokens, lucide-react.

**Spec reference:** `docs/superpowers/specs/2026-04-26-dashboard-tweaks-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `lib/queries/dashboard.ts` | Modify | Extend `DashboardScope` with service/ownerId filters; new `getDashboardAccountsList`; lifetime activity calc |
| `app/actions/dashboard.ts` | Modify | New `fetchDashboardAccountsList` server action |
| `app/(protected)/app/dashboard/page.tsx` | Modify | Read `service`/`owner` searchParams, fetch workspace services + members, render `<DashboardFilters>` |
| `components/dashboard-snapshot.tsx` | Modify | Drop ltv hint, manage accounts-list drawer state, propagate scope, new layout |
| `components/dashboard-health-distribution.tsx` | Modify | Replace bar+pills with recharts `Treemap`, expose `onBucketClick` |
| `components/dashboard-industries-chart.tsx` | Modify | Clickable `<Bar>` |
| `components/dashboard-sizes-chart.tsx` | Modify | Clickable `<Bar>` |
| `components/dashboard-top-accounts-table.tsx` | Modify | Column rename "Actividad" → "Act./mes" |
| `components/dashboard-accounts-list-drawer.tsx` | Create | Shared drawer for items 2/3/4 |
| `components/dashboard-filters.tsx` | Create | Service + Owner dropdowns wired to URL searchParams |

---

## Task 1: Backend foundation — filters, lifetime activity, accounts-list query

**Goal:** All backend changes in one commit. UI consumers don't break because new fields are optional with defaults.

**Files:**
- Modify: `lib/queries/dashboard.ts`
- Modify: `app/actions/dashboard.ts`

- [ ] **Step 1: Extend `DashboardScope` and `scopeConditions`**

In `lib/queries/dashboard.ts`, replace the current `DashboardScope` interface and `scopeConditions` function:

```ts
export interface DashboardScope {
  workspaceId: string;
  userId: string;
  role: string;
  /** Optional service filter — matches accounts whose serviceScope (comma list) contains this label. */
  service?: string | null;
  /** Optional owner filter — restricts to accounts owned by this user (only honored when role allows). */
  ownerId?: string | null;
}

function scopeConditions(scope: DashboardScope) {
  const conds = [
    eq(accounts.workspaceId, scope.workspaceId),
    isNull(accounts.closedAt),
  ];
  if (scope.role !== "owner" && scope.role !== "admin") {
    conds.push(eq(accounts.ownerId, scope.userId));
  } else if (scope.ownerId) {
    conds.push(eq(accounts.ownerId, scope.ownerId));
  }
  if (scope.service) {
    if (scope.service === "Sin servicio") {
      // Account has no serviceScope at all (null) or empty after trim.
      conds.push(
        sql`(${accounts.serviceScope} IS NULL OR btrim(${accounts.serviceScope}) = '')`
      );
    } else {
      // Match accounts whose comma list contains the service. Use ILIKE on the
      // raw text — the breakdown logic does the same kind of substring split,
      // and the user accepted the small false-positive risk.
      conds.push(
        sql`${accounts.serviceScope} ILIKE ${"%" + scope.service + "%"}`
      );
    }
  }
  return conds;
}
```

- [ ] **Step 2: Replace top activity calc in `getWorkspaceDashboardSnapshot`**

Find the block that builds `topActivity`:

```ts
    topActivity = inScopeAccounts
      .map((a) => {
        const tCount = transcriptsByAccount.get(a.id) ?? 0;
        const dCount = docsByAccount.get(a.id) ?? 0;
        return {
          accountId: a.id,
          accountName: a.name,
          fee: a.fee !== null ? Number(a.fee) : null,
          transcriptsCount: tCount,
          documentsCount: dCount,
          activityCount: tCount + dCount,
        };
      })
      .filter((row) => row.activityCount > 0)
      .sort((a, b) => b.activityCount - a.activityCount)
      .slice(0, 10);
```

Replace with:

```ts
    const MS_PER_MONTH_LOCAL = 1000 * 60 * 60 * 24 * (365.25 / 12);
    topActivity = inScopeAccounts
      .map((a) => {
        const tCount = transcriptsByAccount.get(a.id) ?? 0;
        const dCount = docsByAccount.get(a.id) ?? 0;
        const activityCount = tCount + dCount;
        let activityPerMonth: number | null = null;
        if (a.startDate) {
          const start = new Date(a.startDate).getTime();
          const end = a.closedAt
            ? new Date(a.closedAt).getTime()
            : Date.now();
          const months = (end - start) / MS_PER_MONTH_LOCAL;
          if (Number.isFinite(months) && months >= 1) {
            activityPerMonth = activityCount / months;
          }
        }
        return {
          accountId: a.id,
          accountName: a.name,
          fee: a.fee !== null ? Number(a.fee) : null,
          transcriptsCount: tCount,
          documentsCount: dCount,
          activityCount,
          activityPerMonth,
        };
      })
      .filter((row) => row.activityCount > 0)
      .sort((a, b) => {
        // Nulls last; otherwise desc by per-month rate.
        if (a.activityPerMonth === null && b.activityPerMonth === null)
          return 0;
        if (a.activityPerMonth === null) return 1;
        if (b.activityPerMonth === null) return -1;
        return b.activityPerMonth - a.activityPerMonth;
      })
      .slice(0, 10);
```

- [ ] **Step 3: Update `topActivity` type in `DashboardSnapshot`**

In the `DashboardSnapshot` interface, change `topActivity` to:

```ts
  topActivity: Array<{
    accountId: string;
    accountName: string;
    fee: number | null;
    transcriptsCount: number;
    documentsCount: number;
    activityCount: number;
    /** activityCount divided by months active. null when startDate is missing or account is < 1 month old. */
    activityPerMonth: number | null;
  }>;
```

- [ ] **Step 4: Add `getDashboardAccountsList` to `lib/queries/dashboard.ts`**

Append the following at the end of the file (after `getDashboardMetricBreakdown`):

```ts
export type AccountsListFilter =
  | { type: "health"; bucket: HealthBucket }
  | { type: "opportunities" }
  | { type: "industry"; value: string }
  | { type: "size"; value: string };

export interface AccountsListRow {
  id: string;
  name: string;
  serviceScope: string | null;
  ownerName: string | null;
  healthSignal: HealthBucket | null;
}

export async function getDashboardAccountsList(
  scope: DashboardScope,
  period: DashboardPeriod,
  filter: AccountsListFilter
): Promise<AccountsListRow[]> {
  const baseConds = scopeConditions(scope);

  const conds = [...baseConds];
  if (filter.type === "health") {
    if (filter.bucket === "inactive") {
      conds.push(
        sql`(${accounts.healthSignal} IS NULL OR ${accounts.healthSignal} = 'inactive')`
      );
    } else {
      conds.push(eq(accounts.healthSignal, filter.bucket));
    }
  } else if (filter.type === "industry") {
    if (filter.value === "Sin clasificar") {
      conds.push(
        sql`(${accounts.industry} IS NULL OR btrim(${accounts.industry}) = '')`
      );
    } else {
      conds.push(eq(accounts.industry, filter.value));
    }
  } else if (filter.type === "size") {
    if (filter.value === "Sin clasificar") {
      conds.push(
        sql`(${accounts.employeeCount} IS NULL OR btrim(${accounts.employeeCount}) = '')`
      );
    } else {
      conds.push(eq(accounts.employeeCount, filter.value));
    }
  }

  let rows: Array<{
    id: string;
    name: string;
    serviceScope: string | null;
    healthSignal: string | null;
    ownerId: string | null;
  }>;

  if (filter.type === "opportunities") {
    const sinceDate = new Date(`${period.since}T00:00:00Z`);
    const untilDate = new Date(`${period.until}T23:59:59.999Z`);
    rows = await db
      .selectDistinct({
        id: accounts.id,
        name: accounts.name,
        serviceScope: accounts.serviceScope,
        healthSignal: accounts.healthSignal,
        ownerId: accounts.ownerId,
      })
      .from(accounts)
      .innerJoin(signals, eq(signals.accountId, accounts.id))
      .where(
        and(
          ...baseConds,
          inArray(signals.type, ["upsell_opportunity", "growth_opportunity"]),
          eq(signals.status, "active"),
          gte(signals.createdAt, sinceDate),
          lte(signals.createdAt, untilDate)
        )
      );
  } else {
    rows = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        serviceScope: accounts.serviceScope,
        healthSignal: accounts.healthSignal,
        ownerId: accounts.ownerId,
      })
      .from(accounts)
      .where(and(...conds));
  }

  // Resolve owner display names in a single batch.
  const ownerIds = [
    ...new Set(rows.map((r) => r.ownerId).filter(Boolean)),
  ] as string[];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(inArray(users.id, ownerIds));
    for (const u of userRows) {
      ownerNames.set(u.id, u.fullName ?? u.email);
    }
  }

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      serviceScope: r.serviceScope,
      ownerName: r.ownerId ? (ownerNames.get(r.ownerId) ?? null) : null,
      healthSignal:
        (r.healthSignal as HealthBucket | null) ??
        (filter.type === "health" && filter.bucket === "inactive"
          ? "inactive"
          : null),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
}
```

- [ ] **Step 5: Add `fetchDashboardAccountsList` server action**

In `app/actions/dashboard.ts`, add at the end of the file:

```ts
import {
  getDashboardAccountsList,
  type AccountsListFilter,
  type AccountsListRow,
} from "@/lib/queries/dashboard";

export async function fetchDashboardAccountsList(
  filter: AccountsListFilter,
  period: DashboardPeriod,
  service: string | null,
  ownerId: string | null
): Promise<AccountsListRow[]> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Sin workspace");
  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member) throw new Error("Sin membresía en el workspace");

  return getDashboardAccountsList(
    {
      workspaceId: workspace.id,
      userId,
      role: member.role,
      service,
      ownerId,
    },
    period,
    filter
  );
}
```

Make sure the import block at the top of the file already pulls in what's used. The existing imports cover `requireUserId`, `getWorkspaceByUserId`, `getWorkspaceMember`, `DashboardPeriod`. Just add the three new symbols (`getDashboardAccountsList`, `AccountsListFilter`, `AccountsListRow`) to the existing `from "@/lib/queries/dashboard"` import line instead of a separate import block.

- [ ] **Step 6: Type-check**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 7: Commit + push**

```
git add lib/queries/dashboard.ts app/actions/dashboard.ts
git commit -m "feat(dashboard): backend filters, lifetime activity, accounts-list query

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: New `<DashboardAccountsListDrawer>` component

**Goal:** Shared drawer used by health buckets, opportunities, industries, sizes drilldowns.

**Files:**
- Create: `components/dashboard-accounts-list-drawer.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { X, ChevronRight } from "lucide-react";
import { fetchDashboardAccountsList } from "@/app/actions/dashboard";
import type {
  AccountsListFilter,
  AccountsListRow,
  DashboardPeriod,
  HealthBucket,
} from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";

const HEALTH_PILL: Record<HealthBucket, { label: string; cls: string }> = {
  green: {
    label: "Al día",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  yellow: {
    label: "Atención",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  red: {
    label: "En riesgo",
    cls: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  inactive: {
    label: "Sin actividad",
    cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  },
};

interface DashboardAccountsListDrawerProps {
  filter: AccountsListFilter | null;
  title: string | null;
  period: DashboardPeriod;
  service: string | null;
  ownerId: string | null;
  onClose: () => void;
}

export function DashboardAccountsListDrawer({
  filter,
  title,
  period,
  service,
  ownerId,
  onClose,
}: DashboardAccountsListDrawerProps) {
  const [rows, setRows] = useState<AccountsListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!filter) {
      setRows(null);
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await fetchDashboardAccountsList(
          filter,
          period,
          service,
          ownerId
        );
        setRows(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    });
  }, [filter, period, service, ownerId]);

  useEffect(() => {
    if (!filter) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filter, onClose]);

  if (!filter) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Cuentas — ${title ?? ""}`}
        className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col [background:var(--glass-bg)] backdrop-blur-[18px] [border-left:1px_solid_var(--glass-border)] [box-shadow:-12px_0_32px_-12px_rgba(0,0,0,0.18)]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 [border-bottom:1px_solid_var(--glass-border)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cuentas
            </p>
            <h2 className="text-base font-semibold">{title ?? ""}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-accent transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">
          {isPending && (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          )}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {rows && !isPending && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay cuentas en este segmento.
            </p>
          )}
          {rows && !isPending && !error && rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md px-3 py-2.5 text-sm [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
                >
                  <Link
                    href={`/app/accounts/${r.id}`}
                    className="group flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium group-hover:text-primary transition-colors truncate">
                          {r.name}
                        </span>
                        {r.healthSignal && filter.type !== "health" && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              HEALTH_PILL[r.healthSignal].cls
                            )}
                          >
                            {HEALTH_PILL[r.healthSignal].label}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          {r.serviceScope
                            ? r.serviceScope
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .join(" · ")
                            : "Sin servicio"}
                        </span>
                        <span>{r.ownerName ?? "Sin responsable"}</span>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="shrink-0 mt-1 text-muted-foreground group-hover:text-primary transition-colors"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Commit + push**

```
git add components/dashboard-accounts-list-drawer.tsx
git commit -m "feat(dashboard): shared accounts-list drawer for drilldowns

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: New `<DashboardFilters>` component

**Goal:** Two URL-synced dropdowns (service + owner) styled like glass tiles.

**Files:**
- Create: `components/dashboard-filters.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface DashboardFiltersProps {
  services: string[];
  members: Array<{ userId: string; displayName: string }>;
  showOwnerFilter: boolean;
}

export function DashboardFilters({
  services,
  members,
  showOwnerFilter,
}: DashboardFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const currentService = params.get("service") ?? "";
  const currentOwner = params.get("owner") ?? "";

  const onServiceChange = useCallback(
    (value: string) => {
      const qp = new URLSearchParams(params);
      if (value) qp.set("service", value);
      else qp.delete("service");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const onOwnerChange = useCallback(
    (value: string) => {
      const qp = new URLSearchParams(params);
      if (value) qp.set("owner", value);
      else qp.delete("owner");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const selectClass =
    "h-9 rounded-md px-3 text-sm backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Servicio
        </span>
        <select
          value={currentService}
          onChange={(e) => onServiceChange(e.target.value)}
          className={selectClass}
          aria-label="Filtrar por servicio"
        >
          <option value="">Todos los servicios</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="Sin servicio">Sin servicio</option>
        </select>
      </label>

      {showOwnerFilter && (
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Responsable
          </span>
          <select
            value={currentOwner}
            onChange={(e) => onOwnerChange(e.target.value)}
            className={selectClass}
            aria-label="Filtrar por responsable"
          >
            <option value="">Todos los responsables</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Commit + push**

```
git add components/dashboard-filters.tsx
git commit -m "feat(dashboard): new service + owner filter dropdowns

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: Wire filters into the dashboard page

**Goal:** Read `service`/`owner` from searchParams, fetch workspace `services` + members, render `<DashboardFilters>`, propagate to scope.

**Files:**
- Modify: `app/(protected)/app/dashboard/page.tsx`

- [ ] **Step 1: Replace the page component**

Replace the entire file with:

```tsx
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import {
  getWorkspaceByUserId,
  getWorkspaceMember,
  getWorkspaceMembers,
} from "@/lib/queries/workspace";
import {
  getWorkspaceDashboardSnapshot,
  type DashboardPeriod,
} from "@/lib/queries/dashboard";
import { DashboardPeriodSelector } from "@/components/dashboard-period-selector";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DashboardSnapshotView } from "@/components/dashboard-snapshot";

interface DashboardPageProps {
  searchParams: Promise<{
    preset?: string;
    since?: string;
    until?: string;
    service?: string;
    owner?: string;
  }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolvePeriod(params: {
  preset?: string;
  since?: string;
  until?: string;
}): DashboardPeriod {
  if (params.preset === "custom" && params.since && params.until) {
    return { since: params.since, until: params.until };
  }
  const days = Number.parseInt(params.preset ?? "90", 10);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 90;
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - safeDays);
  return { since: isoDate(since), until: isoDate(until) };
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");
  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member) redirect("/auth/login");

  const params = await searchParams;
  const period = resolvePeriod(params);
  const service = params.service?.trim() || null;
  const isElevated = member.role === "owner" || member.role === "admin";
  const ownerId = isElevated ? params.owner?.trim() || null : null;

  const members = isElevated ? await getWorkspaceMembers(workspace.id) : [];

  const snapshot = await getWorkspaceDashboardSnapshot(
    {
      workspaceId: workspace.id,
      userId,
      role: member.role,
      service,
      ownerId,
    },
    period
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {snapshot.totalAccounts === 0
              ? member.role === "member"
                ? "Aún no tenés cuentas asignadas"
                : "Aún no tenés clientes — creá tu primera cuenta"
              : `${snapshot.totalAccounts} cliente${
                  snapshot.totalAccounts !== 1 ? "s" : ""
                } activos`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DashboardFilters
            services={workspace.services}
            members={members.map((m) => ({
              userId: m.userId,
              displayName: m.displayName,
            }))}
            showOwnerFilter={isElevated}
          />
          <DashboardPeriodSelector />
        </div>
      </div>

      {snapshot.totalAccounts === 0 ? (
        <div className="rounded-xl py-20 text-center backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_dashed_var(--glass-border)]">
          <p className="text-sm text-muted-foreground">
            Cuando tengas cuentas activas, vas a ver acá las métricas de tu
            portfolio.
          </p>
        </div>
      ) : (
        <DashboardSnapshotView
          snapshot={snapshot}
          period={period}
          service={service}
          ownerId={ownerId}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean (the page still type-checks even though `DashboardSnapshotView` doesn't yet accept `service`/`ownerId` props — that gets added in Task 5).

If Task 5 hasn't merged yet and type-check complains, run Task 4 + Task 5 as a single commit instead.

- [ ] **Step 3: Hold the commit**

This task is paired with Task 5 because the snapshot view needs new props before the page change is internally consistent. Don't commit yet — proceed straight to Task 5 and commit them together.

---

## Task 5: Snapshot view — drawer state, drop ltvHint, layout reshuffle, opportunities clickable

**Goal:** All `dashboard-snapshot.tsx` changes in one cohesive commit alongside Task 4's page wiring.

**Files:**
- Modify: `components/dashboard-snapshot.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
"use client";

import { useState } from "react";
import {
  Briefcase,
  Wallet,
  Coins,
  Calendar,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { DashboardKPITile } from "@/components/dashboard-kpi-tile";
import { DashboardHealthDistribution } from "@/components/dashboard-health-distribution";
import { DashboardIndustriesChart } from "@/components/dashboard-industries-chart";
import { DashboardSizesChart } from "@/components/dashboard-sizes-chart";
import { DashboardTopAccountsTable } from "@/components/dashboard-top-accounts-table";
import { DashboardMetricDrawer } from "@/components/dashboard-metric-drawer";
import { DashboardAccountsListDrawer } from "@/components/dashboard-accounts-list-drawer";
import type {
  AccountsListFilter,
  DashboardMetricKey,
  DashboardPeriod,
  DashboardSnapshot,
  HealthBucket,
} from "@/lib/queries/dashboard";

interface DashboardSnapshotViewProps {
  snapshot: DashboardSnapshot;
  period: DashboardPeriod;
  service: string | null;
  ownerId: string | null;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMoneyOrDash(n: number | null): string {
  return n === null ? "—" : formatMoney(n);
}

function formatMonths(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)} meses`;
}

function formatInteger(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}

interface OpenMetricDrawer {
  metric: DashboardMetricKey;
  label: string;
  formatValue: (value: number) => string;
}

interface OpenAccountsDrawer {
  filter: AccountsListFilter;
  title: string;
}

const HEALTH_LABEL: Record<HealthBucket, string> = {
  green: "Al día",
  yellow: "Atención",
  red: "En riesgo",
  inactive: "Sin actividad",
};

export function DashboardSnapshotView({
  snapshot,
  period,
  service,
  ownerId,
}: DashboardSnapshotViewProps) {
  const [metricDrawer, setMetricDrawer] = useState<OpenMetricDrawer | null>(
    null
  );
  const [accountsDrawer, setAccountsDrawer] =
    useState<OpenAccountsDrawer | null>(null);

  const noFeeHint =
    snapshot.totalAccounts > 0 &&
    snapshot.accountsWithoutFee / snapshot.totalAccounts > 0.25
      ? `${snapshot.accountsWithoutFee} sin fee no incluidas`
      : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardKPITile
          label="Clientes activos"
          value={formatInteger(snapshot.totalAccounts)}
          icon={<Briefcase size={13} />}
          onClick={() =>
            setMetricDrawer({
              metric: "total_accounts",
              label: "Clientes activos",
              formatValue: (v) => formatInteger(v),
            })
          }
        />
        <DashboardKPITile
          label="Fee total"
          value={formatMoney(snapshot.feeTotal)}
          hint={noFeeHint}
          icon={<Wallet size={13} />}
          onClick={() =>
            setMetricDrawer({
              metric: "fee_total",
              label: "Fee total",
              formatValue: (v) => formatMoney(v),
            })
          }
        />
        <DashboardKPITile
          label="Ticket medio"
          value={formatMoneyOrDash(snapshot.ticketAverage)}
          hint={noFeeHint}
          icon={<Coins size={13} />}
          onClick={() =>
            setMetricDrawer({
              metric: "ticket_average",
              label: "Ticket medio",
              formatValue: (v) => formatMoney(v),
            })
          }
        />
        <DashboardKPITile
          label="Duración media"
          value={formatMonths(snapshot.durationMonthsAverage)}
          icon={<Calendar size={13} />}
          onClick={() =>
            setMetricDrawer({
              metric: "duration_months",
              label: "Duración media (meses)",
              formatValue: (v) => `${v.toFixed(1)} meses`,
            })
          }
        />
        <DashboardKPITile
          label="LTV"
          value={formatMoneyOrDash(snapshot.ltv)}
          icon={<TrendingUp size={13} />}
          onClick={() =>
            setMetricDrawer({
              metric: "ltv",
              label: "LTV",
              formatValue: (v) => formatMoney(v),
            })
          }
        />
        <DashboardKPITile
          label="Oportunidades up/cross"
          value={formatInteger(snapshot.opportunitiesCount)}
          hint="en período seleccionado"
          icon={<Sparkles size={13} />}
          onClick={() =>
            setAccountsDrawer({
              filter: { type: "opportunities" },
              title: "Oportunidades up/cross",
            })
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardHealthDistribution
          distribution={snapshot.healthDistribution}
          onBucketClick={(bucket) =>
            setAccountsDrawer({
              filter: { type: "health", bucket },
              title: `Salud — ${HEALTH_LABEL[bucket]}`,
            })
          }
        />
        <DashboardTopAccountsTable rows={snapshot.topActivity} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardIndustriesChart
          industries={snapshot.industries}
          onSegmentClick={(value) =>
            setAccountsDrawer({
              filter: { type: "industry", value },
              title: `Industria — ${value}`,
            })
          }
        />
        <DashboardSizesChart
          sizes={snapshot.sizes}
          onSegmentClick={(value) =>
            setAccountsDrawer({
              filter: { type: "size", value },
              title: `Tamaño — ${value}`,
            })
          }
        />
      </div>

      <DashboardMetricDrawer
        metric={metricDrawer?.metric ?? null}
        metricLabel={metricDrawer?.label ?? null}
        period={period}
        formatValue={metricDrawer?.formatValue ?? ((v) => String(v))}
        onClose={() => setMetricDrawer(null)}
      />
      <DashboardAccountsListDrawer
        filter={accountsDrawer?.filter ?? null}
        title={accountsDrawer?.title ?? null}
        period={period}
        service={service}
        ownerId={ownerId}
        onClose={() => setAccountsDrawer(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: errors about `DashboardHealthDistribution`, `DashboardIndustriesChart`, `DashboardSizesChart` not accepting the new callback props. Those are fixed in Tasks 6, 7, 8 — but the page+snapshot pair must be consistent first. Hold the commit.

- [ ] **Step 3: Combine page + snapshot view in one commit**

```
git add app/\(protected\)/app/dashboard/page.tsx components/dashboard-snapshot.tsx
git commit -m "feat(dashboard): wire filters, drop ltv hint, drawer state, layout reshuffle

Page reads service/owner searchParams, fetches workspace services + members,
passes filters into the dashboard scope. Snapshot view manages two drawer
states (metric + accounts-list), drops the LTV retention disclaimer, and
moves Top actividad next to the (incoming) health treemap.

Type-check still red — fixed in subsequent tasks that update the chart
components to accept onSegmentClick/onBucketClick callbacks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Don't push yet — wait until Task 8 makes everything green.

> **Note:** This is one of the rare cases where TDD discipline yields to a multi-task atomic change set. We're committing intentionally-broken intermediate state, but staying off the remote until the chain is green.

---

## Task 6: Health distribution → Treemap with click

**Goal:** Replace bar+pills with a recharts `<Treemap>` and expose `onBucketClick`.

**Files:**
- Modify: `components/dashboard-health-distribution.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
"use client";

import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import type { HealthBucket } from "@/lib/queries/dashboard";

const BUCKET_CONFIG: Record<
  HealthBucket,
  { label: string; fill: string }
> = {
  green: { label: "Al día", fill: "#10b981" },
  yellow: { label: "Atención", fill: "#f59e0b" },
  red: { label: "En riesgo", fill: "#dc2626" },
  inactive: { label: "Sin actividad", fill: "#94a3b8" },
};

interface TreemapDatum {
  name: string;
  bucket: HealthBucket;
  size: number;
  fill: string;
}

interface DashboardHealthDistributionProps {
  distribution: Record<HealthBucket, number>;
  onBucketClick?: (bucket: HealthBucket) => void;
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  fill?: string;
  bucket?: HealthBucket;
  onBucketClick?: (bucket: HealthBucket) => void;
}

function TreemapContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name,
  size,
  fill,
  bucket,
  onBucketClick,
}: TreemapContentProps) {
  const showLabel = width > 60 && height > 32;
  const handle = () => {
    if (bucket && onBucketClick) onBucketClick(bucket);
  };
  return (
    <g
      onClick={handle}
      style={{ cursor: bucket && onBucketClick ? "pointer" : "default" }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={2}
        rx={6}
      />
      {showLabel && (
        <>
          <text
            x={x + 10}
            y={y + 18}
            fill="#ffffff"
            fontSize={11}
            fontWeight={600}
            opacity={0.95}
          >
            {name}
          </text>
          <text
            x={x + 10}
            y={y + 36}
            fill="#ffffff"
            fontSize={18}
            fontWeight={700}
          >
            {size}
          </text>
        </>
      )}
    </g>
  );
}

export function DashboardHealthDistribution({
  distribution,
  onBucketClick,
}: DashboardHealthDistributionProps) {
  const order: HealthBucket[] = ["green", "yellow", "red", "inactive"];
  const data: TreemapDatum[] = order
    .map((bucket) => ({
      name: BUCKET_CONFIG[bucket].label,
      bucket,
      size: distribution[bucket],
      fill: BUCKET_CONFIG[bucket].fill,
    }))
    .filter((d) => d.size > 0);
  const total = data.reduce((acc, d) => acc + d.size, 0);

  return (
    <div className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Salud del portfolio</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {total} cuenta{total !== 1 ? "s" : ""}
        </span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">Sin cuentas activas.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <Treemap
            data={data}
            dataKey="size"
            stroke="rgba(255,255,255,0.6)"
            content={
              <TreemapContent onBucketClick={onBucketClick} />
            }
            isAnimationActive={false}
          >
            <Tooltip
              formatter={(value: number, _name, item) => [
                `${value} cuenta${value !== 1 ? "s" : ""}`,
                item?.payload?.name ?? "",
              ]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: snapshot view + page should pass type-check now. If recharts complains about the `content={<TreemapContent ... />}` JSX-as-content pattern, rewrite as `content={(props: TreemapContentProps) => <TreemapContent {...props} onBucketClick={onBucketClick} />}` — the recharts API accepts both function and element forms; functions are sturdier.

- [ ] **Step 3: Hold the commit again**

Two more chart components still need their callbacks added (Tasks 7 and 8). Don't commit yet — proceed.

---

## Task 7: Industries chart — clickable bars

**Files:**
- Modify: `components/dashboard-industries-chart.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DashboardIndustriesChartProps {
  industries: Array<{ industry: string; count: number }>;
  onSegmentClick?: (industry: string) => void;
}

export function DashboardIndustriesChart({
  industries,
  onSegmentClick,
}: DashboardIndustriesChartProps) {
  const data = industries.slice(0, 8);
  return (
    <div className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h3 className="text-sm font-semibold mb-3">Industrias</h3>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos.</p>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(160, data.length * 28)}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="industry"
              width={120}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
              }}
            />
            <Bar
              dataKey="count"
              fill="var(--primary)"
              radius={[0, 4, 4, 0]}
              onClick={(item: { industry: string }) => {
                if (onSegmentClick) onSegmentClick(item.industry);
              }}
              style={{ cursor: onSegmentClick ? "pointer" : "default" }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Hold the commit (one more chart left).**

---

## Task 8: Sizes chart — clickable bars

**Files:**
- Modify: `components/dashboard-sizes-chart.tsx`

- [ ] **Step 1: Read the current file**

The component is structurally identical to the industries chart. Open the file and apply the same pattern.

- [ ] **Step 2: Replace the file**

```tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DashboardSizesChartProps {
  sizes: Array<{ employeeCount: string; count: number }>;
  onSegmentClick?: (employeeCount: string) => void;
}

export function DashboardSizesChart({
  sizes,
  onSegmentClick,
}: DashboardSizesChartProps) {
  const data = sizes.slice(0, 8);
  return (
    <div className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h3 className="text-sm font-semibold mb-3">Tamaño</h3>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos.</p>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(160, data.length * 28)}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="employeeCount"
              width={120}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
              }}
            />
            <Bar
              dataKey="count"
              fill="var(--primary)"
              radius={[0, 4, 4, 0]}
              onClick={(item: { employeeCount: string }) => {
                if (onSegmentClick) onSegmentClick(item.employeeCount);
              }}
              style={{ cursor: onSegmentClick ? "pointer" : "default" }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```
npm run type-check
```

Expected: clean across the whole project.

- [ ] **Step 4: Commit ALL pending changes (Tasks 4–8) in one push**

```
git add components/dashboard-health-distribution.tsx components/dashboard-industries-chart.tsx components/dashboard-sizes-chart.tsx
git commit -m "feat(dashboard): treemap health + clickable industry & size bars

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

This single push lands the page wiring (Task 4 commit) + snapshot view + 3 chart updates as a coherent set on the remote.

---

## Task 9: Top accounts table — "Act./mes" column

**Goal:** Display the new `activityPerMonth` field with a clear label and tooltip.

**Files:**
- Modify: `components/dashboard-top-accounts-table.tsx`

- [ ] **Step 1: Replace the component**

```tsx
"use client";

import Link from "next/link";

interface TopActivityRow {
  accountId: string;
  accountName: string;
  fee: number | null;
  transcriptsCount: number;
  documentsCount: number;
  activityCount: number;
  activityPerMonth: number | null;
}

interface DashboardTopAccountsTableProps {
  rows: TopActivityRow[];
}

function formatFee(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPerMonth(n: number | null): string {
  if (n === null) return "—";
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

export function DashboardTopAccountsTable({
  rows,
}: DashboardTopAccountsTableProps) {
  return (
    <div className="rounded-xl backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold">Top actividad</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          promedio mensual del cliente
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Sin actividad en el período.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Cliente</th>
              <th className="px-4 py-2 text-right font-medium">Fee</th>
              <th
                className="px-4 py-2 text-right font-medium"
                title="Reuniones + archivos en el período, divididos por meses activos del cliente"
              >
                Act./mes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.accountId}
                className="[border-top:1px_solid_var(--glass-tile-border)]"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/app/accounts/${r.accountId}`}
                    className="hover:text-primary transition-colors"
                  >
                    {r.accountName}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {formatFee(r.fee)}
                </td>
                <td
                  className="px-4 py-2 text-right tabular-nums"
                  title={`${r.transcriptsCount} reuniones · ${r.documentsCount} archivos en el período · total ${r.activityCount}`}
                >
                  {formatPerMonth(r.activityPerMonth)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Commit + push**

```
git add components/dashboard-top-accounts-table.tsx
git commit -m "feat(dashboard): top activity column shows monthly average per client

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 10: End-to-end verification

**Goal:** Confirm the whole dashboard renders correctly, drilldowns work, filters narrow data.

- [ ] **Step 1: Type-check final pass**

```
npm run type-check
```

Expected: clean.

- [ ] **Step 2: Manual walk-through**

Open `npm run dev` and visit `/app/dashboard`. Verify:

- LTV tile and its drawer show "LTV" only — no retention disclaimer anywhere.
- Health treemap renders 4 rectangles (or fewer if some buckets are 0), color-coded; hovering shows tooltip with label + count; clicking opens an accounts list drawer titled "Salud — <bucket>" populated with the right accounts.
- Top actividad now sits next to the treemap; column header reads "Act./mes"; longer-tenured accounts no longer dominate the top rows; tooltip on numeric cells explains the calc.
- "Oportunidades up/cross" tile is now clickable; opens drawer titled "Oportunidades up/cross" with accounts that have active up-sell/growth signals in the period.
- Bars in "Industrias" and "Tamaño" are clickable; clicking any segment opens drawer titled "Industria — <name>" or "Tamaño — <name>" — including "Sin clasificar".
- Service dropdown narrows every metric; "Sin servicio" surfaces only accounts without any.
- Owner dropdown only visible when logged in as owner/admin; selecting a user narrows everything.
- Drawers close on ESC and on backdrop click; long lists scroll inside.
- URL reflects all filters: `?preset=90&service=Growth&owner=<uid>`.
- No console errors.

- [ ] **Step 3: If any issue is found, fix in a follow-up commit.**

---

## Self-review checklist

- [x] Spec coverage: every item (1-6 + bonus layout) maps to at least one task. ✓
- [x] No placeholders or "implement later". ✓
- [x] Types consistent: `topActivity` field added to `DashboardSnapshot` (Task 1) before consumed (Task 9); `service`/`ownerId` props added to `DashboardSnapshotView` (Task 5) at the same commit as the page (Task 4). ✓
- [x] Atomic-broken-state caveat: Tasks 4-8 stage on local but don't push until Task 8 lands the chart updates that satisfy the new prop signatures. Single coherent push to remote. ✓
