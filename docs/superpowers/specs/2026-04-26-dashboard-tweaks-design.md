# Dashboard tweaks (post-shipping iteration 1)

**Date:** 2026-04-26
**Owner:** nicodmatutem@gmail.com
**Surface:** `/app/dashboard` (workspace dashboard shipped 2026-04-25 in `0c71036`)

## Goal

Apply 6 user-driven improvements to the workspace dashboard after first usage feedback. The dashboard becomes more interactive (drilldowns from health, opportunities, industries and sizes), the "Top actividad" metric is normalized by tenure to surface genuinely active accounts, and global filters by service and owner allow team-leads to scope the view.

## Non-goals

- No DB schema changes
- No changes to the existing `DashboardMetricDrawer` (financial KPI breakdowns) — keeps working as-is
- No changes to permission rules (members still see only their own accounts)
- No changes to the period selector, pricing, or layout outside the dashboard

## Item-by-item

### 1. LTV — drop the disclaimer

`components/dashboard-snapshot.tsx`:
- Remove `const ltvHint = "Asume retención total — sin churn";` and stop passing it to the LTV `<DashboardKPITile>`.
- Drawer label simplifies: `"LTV (asume retención total)"` → `"LTV"`.

### 2. "Salud del portafolio" — Treemap with click-to-list

Replace the existing horizontal-bar + 4-pill layout in `components/dashboard-health-distribution.tsx` with a recharts `<Treemap>`:
- 4 leaf rectangles, one per bucket (`green`, `yellow`, `red`, `inactive`).
- Size = count of accounts in that bucket.
- Color = the existing per-bucket Tailwind palette (emerald/amber/red/slate).
- Each rectangle renders the bucket label + count overlaid in white text.
- Click a rectangle → opens the new `DashboardAccountsListDrawer` filtered by that health bucket.

Component remains a "use client" island; receives the same `distribution` prop plus a new `onBucketClick(bucket: HealthBucket)` callback.

### 3. "Oportunidades up/cross" — clickable KPI

The existing KPI tile becomes interactive:
- Add `onClick` that opens `DashboardAccountsListDrawer` with `filter: 'opportunities'`.
- Drawer lists every account that has at least one `signals` row of type `upsell_opportunity` or `growth_opportunity` with `status = 'active'` whose `createdAt` falls within the period.

### 4. "Industrias" / "Tamaño" — clickable bars

`components/dashboard-industries-chart.tsx` and `dashboard-sizes-chart.tsx`:
- Wrap the recharts `<Bar>` element with `onClick` that fires the parent callback `onSegmentClick(label: string)`.
- "Sin clasificar" works exactly the same as any other label — no special-case styling, but it's the most useful entry point in practice.
- Drawer opens with `filter: 'industry' | 'size'` and `value: <label>`.

### 5. "Top actividad" — monthly average over the account's lifetime

In `lib/queries/dashboard.ts > getWorkspaceDashboardSnapshot`:
- Add `activityPerMonth: number | null` to each `topActivity` row.
- Compute as `activityCount / monthsActive` where `monthsActive = (closedAt ?? now) - startDate` in months. Only valid when `startDate` is non-null AND `monthsActive >= 1` (clamp the floor so 1-week-old accounts don't get a wildly inflated rate).
- For accounts where `monthsActive` is unknown or `< 1`, `activityPerMonth` is `null` — they sort to the bottom and render as `—`.
- Sort `topActivity` by `activityPerMonth` desc (nulls last), keep limit at 10.
- The component column header changes from "Actividad" → "Act./mes". Tooltip explains: "Reuniones + archivos en el período, divididos por meses activos del cliente".

### 6. Global filters — service and owner

Add a new client component `components/dashboard-filters.tsx` that renders two `<select>` dropdowns next to the existing `<DashboardPeriodSelector>` in the page header. State lives in URL search params (`service`, `owner`) so the dashboard remains a Server Component bookmarkable URL.

**Service dropdown:**
- Always visible.
- Options: `"Todos"` (default, no filter), each entry from `workspace.services`, plus `"Sin servicio"` for accounts whose `serviceScope` is null/empty.
- When applied, accounts pass the filter if their `expandServices(serviceScope)` includes the chosen service (matches the same logic the breakdown uses today).

**Owner dropdown:**
- Visible only when `member.role === 'owner' || 'admin'`. Members already see only their own accounts; the dropdown would be redundant.
- Options: `"Todos"` (default), then every workspace member rendered as `displayName` (already provided by `getWorkspaceMembers`).
- When applied, accounts pass the filter if `accounts.ownerId === selectedUserId`.

**Where filters apply:** they are passed into `DashboardScope` and applied at the start of `getWorkspaceDashboardSnapshot` (single source of truth — every metric, treemap, chart, and table in the dashboard sees only the filtered accounts). The new accounts-list drawer also accepts the scope, so its results stay consistent with the visible dashboard.

### 7. Layout adjustment (bonus, requested by user)

After replacing the health distribution with a treemap, the visual weight changes. Move "Top actividad" up so it sits next to the treemap.

New section order in `components/dashboard-snapshot.tsx`:
1. KPI grid (6 tiles, unchanged structure)
2. **NEW:** 2-col row → `[Salud treemap | Top actividad]`
3. 2-col row (unchanged) → `[Industrias | Tamaño]`
4. (Drawer stack, drawer overlays)

The "Top actividad" table widens to half-width on `lg` and stacks below the treemap on `md`/`sm`.

## New components

### `components/dashboard-accounts-list-drawer.tsx`

Mirrors the existing `DashboardMetricDrawer` shape (right-aligned glass aside, ESC to close, `useTransition` for fetches).

Props:
```ts
type AccountsListFilter =
  | { type: 'health'; bucket: HealthBucket }
  | { type: 'opportunities' }
  | { type: 'industry'; value: string }
  | { type: 'size'; value: string };

interface Props {
  filter: AccountsListFilter | null;
  period: DashboardPeriod;
  service: string | null;
  ownerId: string | null;
  onClose: () => void;
}
```

When `filter` becomes non-null, calls a new server action `fetchDashboardAccountsList(filter, period, service, ownerId)` and renders the result list.

List item: account name (linked to `/app/accounts/[id]`), service tags, owner display name, optional health pill (when filter type is not `health`). Empty state: "No hay cuentas en este segmento."

### `components/dashboard-filters.tsx`

Two native `<select>` elements styled with the existing glass tile style. Reads/writes URL search params via `useSearchParams` + `router.push` (same pattern as `DashboardPeriodSelector`).

Props:
```ts
interface Props {
  services: string[];               // workspace.services
  members: Array<{ userId: string; displayName: string }>;
  showOwnerFilter: boolean;         // role check from server
}
```

## Backend additions

`lib/queries/dashboard.ts`:

1. Extend `DashboardScope` with optional `service: string | null` and `ownerId: string | null`. Update `scopeConditions(scope)` to apply both filters at the SQL level when present (`ownerId` is a simple `eq`; `service` requires a `LIKE %service%` on `accounts.serviceScope` because it's stored as comma-separated text — accept the small false-positive risk on substring matches; the existing breakdown uses the same `expandServices` parser, so we'll mirror it).
2. New function `getDashboardAccountsList(scope, period, filter): Promise<AccountsListResult[]>` — pulls accounts in scope and applies the filter:
   - `health`: `accounts.healthSignal === bucket` (treat null as `inactive`).
   - `opportunities`: join `signals` where `type` ∈ {`upsell_opportunity`,`growth_opportunity`}, `status === 'active'`, and `createdAt` ∈ `[period.since, period.until]`.
   - `industry`: `accounts.industry === value` (or null/empty for `"Sin clasificar"`).
   - `size`: `accounts.employeeCount === value` (or null/empty for `"Sin clasificar"`).
   - Returns: `{ id, name, serviceScope, ownerName, healthSignal }`.

`app/actions/dashboard.ts`:
- New server action `fetchDashboardAccountsList(filter, period, service, ownerId)` mirrors `fetchDashboardBreakdown` (auth check → workspace lookup → call the new query).

## Files touched (summary)

| Path | Action |
|---|---|
| `lib/queries/dashboard.ts` | Modify — extend `DashboardScope`, scope conditions, top-activity calc, add `getDashboardAccountsList` |
| `app/actions/dashboard.ts` | Modify — add `fetchDashboardAccountsList` |
| `app/(protected)/app/dashboard/page.tsx` | Modify — read `service`/`owner` searchParams, fetch workspace `services` + members, render `<DashboardFilters>` |
| `components/dashboard-snapshot.tsx` | Modify — drop ltv hint, new accounts-list drawer state, new layout, propagate scope to drawer |
| `components/dashboard-health-distribution.tsx` | Modify — replace bar+pills with recharts `Treemap`, add `onBucketClick` |
| `components/dashboard-industries-chart.tsx` | Modify — `onClick` on the `Bar` |
| `components/dashboard-sizes-chart.tsx` | Modify — `onClick` on the `Bar` |
| `components/dashboard-top-accounts-table.tsx` | Modify — column rename "Actividad" → "Act./mes", value formatting |
| `components/dashboard-accounts-list-drawer.tsx` | Create |
| `components/dashboard-filters.tsx` | Create |

## Constraints

- Server-Component-first: filters and snapshot live on the server; only drawers and selectors are client islands.
- No new dependencies — recharts already includes `Treemap`.
- Type-check passes after every commit (lint is non-functional in this repo).
- Auto-push after every commit (per workspace convention).

## Verification

- `npm run type-check` clean after each phase
- Manual walkthrough on `/app/dashboard`:
  - LTV tile + drawer no longer show the retention disclaimer
  - Health treemap rectangles sized by bucket count, click → drawer with accounts of that bucket
  - Opportunities tile clickable → drawer
  - Bars in industries/sizes clickable → drawer
  - Top actividad column says "Act./mes", longer-tenured accounts no longer dominate
  - Service filter narrows everything; owner filter only visible to owner/admin
  - URL reflects filters: e.g. `?preset=90&service=Growth&owner=<uid>`
- No console errors, drawers ESC to close, drawer scrolls when content overflows
