# Perf pass — account detail + paid media

**Date:** 2026-04-26
**Surface:** `/app/accounts/[accountId]` and its `/paid-media` child route. Touches 3 other pages that share the workspace+member query pattern.

## Goal

Reduce perceived latency on the two pages the user flagged as feeling slow (account detail + paid media). Stay strictly within "low-hanging fruit": no caching layer, no edge runtime, no schema changes.

## Items

### A — Route-level `loading.tsx`

Create `loading.tsx` in both routes:
- `app/(protected)/app/accounts/[accountId]/loading.tsx`
- `app/(protected)/app/accounts/[accountId]/paid-media/loading.tsx`

Each renders a skeleton that matches the rough shape of its page (back link, header strip, body blocks). Glass background. Uses `animate-pulse` on muted-color blocks so the user sees instant motion on click instead of a frozen "previous page" until data resolves.

### B — Combined `getWorkspaceWithMember` helper

New helper in `lib/queries/workspace.ts`:

```ts
export async function getWorkspaceWithMember(
  userId: string
): Promise<{ workspace: Workspace; member: WorkspaceMember } | null>
```

Single SQL with one join: `workspaceMembers innerJoin workspaces`. Saves one DB round-trip per protected page (≈ 50-100ms each on Supabase free tier).

Migrate the **5 known call sites** that fetch both consecutively:
- `app/(protected)/app/dashboard/page.tsx`
- `app/(protected)/app/profile/page.tsx`
- `app/(protected)/app/accounts/[accountId]/page.tsx`
- `app/(protected)/app/portfolio/page.tsx` (audit — likely uses both)
- `app/(protected)/app/settings/workspace/page.tsx` (audit)

Existing `getWorkspaceByUserId` and `getWorkspaceMember` stay (still used in `lib/auth.ts` and elsewhere where only one is needed). No big-bang.

### C — Parallelize `getAccountById` + `getPaidMediaState`

In `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx` lines 57-60, both fetches need workspace.id + accountId — they're independent. Wrap in `Promise.all`. One-line change, saves another round-trip.

### D — Suspense streaming for below-the-fold sections

**Account detail page** — currently the page does a `Promise.all` of 9 queries and only renders after ALL finish. Refactor so the header (name, AI summary, account context, edit form) renders as soon as `account` resolves, and the heavy below-the-fold sections each stream independently.

New async server components, one per section, each fetches its own data and renders the existing presentational component:

- `components/account-detail/last-meeting-section.tsx` — wraps `<LastMeetingCard>`, fetches `getLatestMeetingSummary`
- `components/account-detail/files-section.tsx` — wraps `<ContextFilesTimeline>` inside its `<CollapsibleSection>`, fetches `getTranscriptHistory` + `getAccountContextDocuments` in parallel
- `components/account-detail/tasks-section.tsx` — wraps `<TasksPanel>`, fetches `getAccountTasks` (needs workspace members for assignee dropdown — receive `members` as prop from page since it's already fetched)
- `components/account-detail/participants-section.tsx` — wraps `<ParticipantsPanel>`, fetches `getAccountParticipants`
- `components/account-detail/signals-section.tsx` — wraps `<SignalsPanel>`, fetches `getAccountSignals`
- `components/account-detail/health-section.tsx` — wraps `<HealthHistoryTimeline>`, fetches `getAccountHealthHistory`

Page wraps each in `<Suspense fallback={<SectionSkeleton />}>`. The fallback is a thin `<CollapsibleSection title="…" summary="cargando…">` placeholder so the layout doesn't shift.

**Paid media page** — KPIs, campaigns, ads, change history each become their own Suspense block. Header (account name + period selector) renders instantly. New sub-components:

- `components/paid-media/kpis-section.tsx` — fetches `getKpisWithComparison`, renders the 6 + 4 KPI tiles
- `components/paid-media/campaigns-section.tsx` — fetches `getCampaignsWithKpis`
- `components/paid-media/ads-section.tsx` — fetches `getActiveAdsWithKpis`
- `components/paid-media/changes-section.tsx` — fetches `getChangeEventsForAdAccount`

Note: the chart modal (`PaidMediaKpiChartModal`) stays at the page level because it's controlled by `?chart=` searchParam and needs to render alongside any tab.

## Out of scope

- DB index audit (item E in the diagnosis) — defer until we measure perceived improvement after A-D.
- Reducing glass blur — design decision, not an actual perf bottleneck.
- React Cache / `unstable_cache` / `revalidateTag` strategies — too easy to introduce stale-data bugs, defer.
- Edge runtime / streaming SSR — structural change, defer.

## Files (summary)

| Path | Action |
|---|---|
| `app/(protected)/app/accounts/[accountId]/loading.tsx` | Create |
| `app/(protected)/app/accounts/[accountId]/paid-media/loading.tsx` | Create |
| `lib/queries/workspace.ts` | Modify (add helper) |
| `app/(protected)/app/dashboard/page.tsx` | Modify (use helper) |
| `app/(protected)/app/profile/page.tsx` | Modify (use helper) |
| `app/(protected)/app/portfolio/page.tsx` | Modify (use helper if applicable) |
| `app/(protected)/app/settings/workspace/page.tsx` | Modify (use helper if applicable) |
| `app/(protected)/app/accounts/[accountId]/page.tsx` | Modify (use helper + Suspense refactor) |
| `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx` | Modify (parallelize + Suspense) |
| `components/account-detail/{last-meeting,files,tasks,participants,signals,health}-section.tsx` | Create (6 files) |
| `components/paid-media/{kpis,campaigns,ads,changes}-section.tsx` | Create (4 files) |

## Verification

- `npm run type-check` clean after each phase
- Manual walkthrough:
  - Click an account from portfolio → instant skeleton appears (A)
  - Account detail header (name, AI summary, context) renders before the bottom sections (D)
  - Click "Paid Media" inside an account → instant skeleton (A)
  - Paid media KPIs appear before the ads table and change timeline (D)
  - All counts and data are correct (no functional regression)
  - URL persistence (?edit=1, ?preset=14, etc.) still works

## Order

1. **A** — loading.tsx (highest perception payoff, near-zero risk)
2. **B** — combined helper + migrate call sites (small, mechanical)
3. **C** — paid media parallelize (one-liner)
4. **D** — Suspense streaming refactor (most code change, last so we can ship the easy wins first)
5. **E2E verification** — type-check + manual walkthrough
