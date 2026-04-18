# Meta Ads v2 — Enhancements Design

**Date:** 2026-04-17
**Status:** Proposed
**Depends on:** Meta Ads sub-project 1 (code-complete, awaiting smoke test)

## 1. Scope

Six enhancements to the existing Meta Ads / Paid Media module (sub-project 1 already shipped). Bundled into a single implementation plan because all changes touch the same surface (`/app/accounts/[id]/paid-media` dashboard, sync pipeline, and related components).

| # | Enhancement | Complexity |
|---|---|---|
| 1 | Sync Meta ads (ad-level granularity) with individual insights | Medium |
| 2 | Clickable KPI cards open modal with line chart + previous-period comparison | Medium |
| 3 | Change-history log for campaigns, ad sets (targeting only), and ads | Large |
| 4 | Filter campaigns table to rows with spend/results > 0 in period | Small |
| 5 | Rename "Conversiones" → "Leads" (non-ecomm) / "Ventas" (ecomm) | Trivial |
| 6 | Rename "Spend" → "Inversión" everywhere | Trivial |

## 2. Locked Scope Decisions

### Change-history event whitelist

Stored events are limited to ones that correlate meaningfully with performance changes. Raw activity payload is preserved in `rawActivity` jsonb for future extraction.

**Campaign-level:** created, deleted, status change, budget change, name change, start/end date change, objective change.

**Ad-set-level** (only these four, no ad-set entity stored): targeting/audience change, placements change, budget change (when budget lives at ad-set level), schedule change.

**Ad-level:** created, deleted, status change, creative change (image/video/carousel swap), copy change (headline / primary text / description), destination URL change, CTA button change.

**Explicitly excluded:** bid strategy adjustments, pixel/conversion config changes, catalog changes, minor scheduling tweaks.

### Ads table filter

Rows with `SUM(spend) > 0 OR SUM(conversions) > 0` in the filtered period. Status is irrelevant. This is the **same filter** applied to the campaigns table (item 4 unifies both).

### KPI chart modal

**All 10 KPI cards** on the dashboard are clickable (`Inversión`, `Impresiones`, `Alcance`, `Clicks`, `CTR`, `CPM`, `Leads/Ventas`, `CPL/CPA`, `Frecuencia`, `ROAS` when ecomm).

Opens a **centered modal** (option A from brainstorming). Shows a line chart with two series: current period and the previous period of the same length, with the previous series' dates aligned to the current-period axis (day 1 vs day 1, etc).

Previous period is defined as `[since - N days, since - 1 day]`. Our 90-day retention covers all presets (7/14/30) with room to spare.

### Change history storage (option C — polymorphic + raw payload)

Single table `meta_change_events` with `entity_type` discriminator, structured `event_data` jsonb, and a `raw_activity` jsonb field that preserves Meta's full response. Enables extracting additional fields later without re-syncing.

### Label mapping

| Current | Non-ecommerce | E-commerce |
|---|---|---|
| Spend | Inversión | Inversión |
| Conversiones | Leads | Ventas |
| CPL | CPL (kept) | — |
| CPA | — | CPA (kept — standard marketing term) |

Other labels (`Impresiones`, `Alcance`, `Clicks`, `CTR`, `CPM`, `Frecuencia`, `ROAS`) are not renamed.

## 3. Schema Changes

### 3.1 New table: `meta_ads`

```
id             uuid PK
adAccountId    uuid FK → meta_ad_accounts  ON DELETE CASCADE
campaignId     uuid FK → meta_campaigns    ON DELETE CASCADE
metaAdId       text NOT NULL
name           text NOT NULL
status         text NOT NULL
creativeId     text
createdAt      timestamptz NOT NULL DEFAULT now()
updatedAt      timestamptz NOT NULL DEFAULT now()
lastSyncedAt   timestamptz
UNIQUE (adAccountId, metaAdId)
INDEX (campaignId)
```

### 3.2 New table: `meta_ad_insights_daily`

```
id               uuid PK
adAccountId      uuid FK → meta_ad_accounts  ON DELETE CASCADE
adId             uuid FK → meta_ads          ON DELETE CASCADE
campaignId       uuid FK → meta_campaigns    ON DELETE CASCADE  -- denormalized for fast queries
date             date NOT NULL
spend            integer NOT NULL DEFAULT 0  -- cents
impressions      integer NOT NULL DEFAULT 0
reach            integer NOT NULL DEFAULT 0
clicks           integer NOT NULL DEFAULT 0
conversions      integer NOT NULL DEFAULT 0
conversionValue  integer                     -- cents, null when not ecomm
frequency        numeric(6,2)
UNIQUE (adAccountId, adId, date)
INDEX (adAccountId, date)
INDEX (campaignId, date)
```

Retention: 90 days (matches `meta_insights_daily`). Older rows pruned by the existing daily cleanup cron (extend its query to include this table).

### 3.3 New table: `meta_change_events`

```
id              uuid PK
adAccountId     uuid FK → meta_ad_accounts  ON DELETE CASCADE
entityType      text NOT NULL  CHECK (entityType IN ('campaign','ad_set','ad'))
entityMetaId    text NOT NULL  -- Meta's native ID for the campaign/adset/ad
entityLocalId   uuid           -- soft FK to meta_campaigns.id or meta_ads.id when entity is synced; null for ad_set (no local table)
eventType            text NOT NULL  -- normalized: 'campaign_budget_change', 'ad_creative_change', 'ad_set_targeting_change', etc.
eventData            jsonb NOT NULL -- structured: { field, old_value, new_value, ... }
rawActivity          jsonb NOT NULL -- complete Meta API response row
parentCampaignMetaId text           -- populated for ad_set events so we can scope the drawer timeline; null for campaign/ad rows
occurredAt           timestamptz NOT NULL
syncedAt             timestamptz NOT NULL DEFAULT now()
UNIQUE (adAccountId, entityMetaId, eventType, occurredAt)
INDEX (adAccountId, occurredAt DESC)
INDEX (entityType, entityMetaId)
INDEX (entityType, parentCampaignMetaId)  -- for drawer timeline scoping
```

The composite UNIQUE guarantees re-sync idempotency. The `(adAccountId, occurredAt DESC)` index serves the primary timeline query.

### 3.4 No modifications to existing tables.

### 3.5 Migration

Single migration `0006_<name>.sql` generated via `npm run db:generate`, plus a `down.sql` that drops the three tables in reverse dependency order.

## 4. Sync Pipeline

### 4.1 Extended task: `sync-single-ad-account`

Current flow (campaigns → campaign insights) becomes:

```
sync-single-ad-account (hourly, per ad account)
├─ fetchAndUpsertCampaigns          (existing)
├─ fetchAndUpsertAds                (NEW)
├─ fetchAndUpsertInsights           (existing, campaign-level)
├─ fetchAndUpsertAdInsights         (NEW, ad-level)
└─ fetchAndUpsertChangeEvents       (NEW)
```

All calls share the same access token and run sequentially within a single Trigger.dev run. A failure anywhere causes the entire task to retry with exponential backoff. Idempotency is guaranteed by the UNIQUE constraints on every upsert.

### 4.2 New helpers in `lib/meta/`

**`sync-ads.ts`**

- `fetchAndUpsertAds(adAccountRowId, metaAdAccountId, accessToken, campaignIdMap)` — paginates `GET /act_{id}/ads?fields=id,name,status,creative,campaign_id&limit=500`. Drops ads whose campaign is not in `campaignIdMap`. Upserts into `meta_ads`. Returns `Map<metaAdId, localAdId>`.

- `fetchAndUpsertAdInsights(adAccountRowId, adIdMap, campaignIdMap, since, until, conversionEvent, isEcommerce)` — paginates `GET /act_{id}/insights?level=ad&time_increment=1&fields=ad_id,campaign_id,spend,impressions,reach,clicks,frequency,actions,action_values&limit=500`. For each row, resolves `adId` and `campaignId` against the maps; extracts conversions using the account's `conversionEvent`; upserts into `meta_ad_insights_daily`.

**`sync-changes.ts`**

- `fetchAndUpsertChangeEvents(adAccountRowId, metaAdAccountId, accessToken, since)` — paginates `GET /act_{id}/activities?fields=event_type,event_time,object_id,object_type,object_name,actor_id,actor_name,extra_data&since=<last_synced>&limit=500`. Filters rows against the `event_type` whitelist (§2). Normalizes `event_type` to our `eventType` naming. Extracts structured `old_value`/`new_value` from Meta's `extra_data` into `eventData`. Stores full row in `rawActivity`. Upserts keyed by the 4-column UNIQUE.
- For ad-set events, the helper additionally resolves `parentCampaignMetaId` by querying `/{ad_set_meta_id}?fields=campaign_id` on first encounter. Results are cached per-sync in a `Map<ad_set_meta_id, campaign_meta_id>` to avoid duplicate lookups when multiple events target the same ad set.

### 4.3 Backfill task `backfill-meta-ads` (extended)

Runs once when a new ad account is mapped. Extended to:

1. Sync campaigns (existing)
2. Sync ads (new)
3. 90 days of campaign-level insights (existing)
4. **90 days of ad-level insights (new)**
5. **90 days of change events (new)** — passes `since = now - 90d` to `fetchAndUpsertChangeEvents`

### 4.4 Event-type normalization

Meta's legacy `/activities` endpoint uses confusing terminology (ad sets are called "campaigns" in some event names). We normalize in our `eventType` field:

| Meta `event_type` | Our `eventType` | `entityType` |
|---|---|---|
| `create_campaign_group` | `campaign_created` | `campaign` |
| `update_campaign_group_status` | `campaign_status_change` | `campaign` |
| `update_campaign_group_budget` | `campaign_budget_change` | `campaign` |
| `update_campaign_name` | `campaign_name_change` | `campaign` |
| `update_campaign_schedule` | `campaign_schedule_change` | `campaign` |
| `update_campaign_objective` | `campaign_objective_change` | `campaign` |
| `delete_campaign_group` | `campaign_deleted` | `campaign` |
| `create_campaign` | `ad_set_created` | `ad_set` |
| `update_campaign_targeting` | `ad_set_targeting_change` | `ad_set` |
| `update_campaign_budget` | `ad_set_budget_change` | `ad_set` |
| `update_campaign_schedule` | `ad_set_schedule_change` | `ad_set` |
| `delete_campaign` | `ad_set_deleted` | `ad_set` |
| `create_ad` | `ad_created` | `ad` |
| `update_ad_status` | `ad_status_change` | `ad` |
| `update_ad_creative` | `ad_creative_change` | `ad` |
| `update_ad_run_status` | `ad_run_status_change` | `ad` |
| `delete_ad` | `ad_deleted` | `ad` |

Events not in this table are dropped.

### 4.5 Volume and rate limits

- Typical ad account: ~50-200 active ads, 10-50 change events/week.
- Meta Graph API limit: ~200 calls/hour per token. A single hourly sync uses ~10-20 calls per ad account. Headroom is large.

## 5. UI Changes

### 5.1 Dashboard layout (`/app/accounts/[id]/paid-media`)

```
┌──────────────────────────────────────────────┐
│ KPI cards (all clickable → modal)            │
├──────────────────────────────────────────────┤
│ Campañas   ← filter: spend/conversions > 0   │
├──────────────────────────────────────────────┤
│ Anuncios activos   ← NEW, same filter        │
├──────────────────────────────────────────────┤
│ Historial de cambios   ← NEW, timeline       │
└──────────────────────────────────────────────┘
```

### 5.2 New component: `paid-media-kpi-chart-modal.tsx`

- Opened by adding `?chart=<metricKey>` to the URL (deep-linkable)
- Line chart using `recharts` with two series:
  - `current` (color: primary)
  - `previous` (color: muted, dashed)
- Previous-period dates are re-keyed onto the current-period axis so both series align by "day N of period"
- Header shows: metric name, current total, previous total, delta %
- Daily granularity (max preset = 30 days → 30 points, readable)
- Tooltip shows both values and the pointwise delta

### 5.3 New component: `paid-media-ads-table.tsx`

- Columns: Nombre, Campaña (link to campaign drawer), Estado, Inversión, Impresiones, Clicks, CTR, Leads/Ventas, CPL/CPA
- Filtered to ads with `SUM(spend) > 0 OR SUM(conversions) > 0` in the period
- Row click opens a new `paid-media-ad-drawer.tsx` — mirrors the campaign drawer pattern: full ad KPIs, line chart of spend/conversions. **Creative preview is NOT in scope**; a placeholder shows the `creativeId` as a muted label. See §8.
- Sorted descending by Inversión by default

### 5.4 New component: `paid-media-change-timeline.tsx`

- Timeline descending by `occurredAt`
- Each entry renders: timestamp (relative), entity type + name, event description, old → new where applicable
- Level filter chips (Todas / Campañas / Ad Sets / Anuncios)
- Pagination: initial 20 rows, "Ver más" loads next 20
- Entity names are resolved by joining `entityLocalId` to `meta_campaigns`/`meta_ads` when available, falling back to the `object_name` captured in `rawActivity` for ad sets

### 5.5 Extended component: `paid-media-campaign-drawer.tsx`

Two new sections appended to the existing drawer:

1. **Anuncios de esta campaña** — inline mini version of the ads table, scoped to this campaign
2. **Cambios recientes** — timeline filtered to this campaign: includes events where `entityType='campaign' AND entityLocalId=<campaignId>`, plus ad-set events where `rawActivity.parent_id` matches this campaign's Meta ID, plus ad events whose `entityLocalId` is an ad belonging to this campaign

### 5.6 Extended component: `paid-media-mini-card.tsx`

Label updates only (Inversión, Leads/Ventas). No structural changes.

### 5.7 Label mapping utility

New file `lib/meta/labels.ts`:

```ts
export function getPaidMediaLabels(isEcommerce: boolean) {
  return {
    spend: "Inversión",
    conversions: isEcommerce ? "Ventas" : "Leads",
    cpa: isEcommerce ? "CPA" : "CPL",
    impressions: "Impresiones",
    reach: "Alcance",
    clicks: "Clicks",
    ctr: "CTR",
    cpm: "CPM",
    frequency: "Frecuencia",
    roas: "ROAS",
  } as const;
}
```

All components consuming paid-media labels read from this helper. Eliminates hardcoded label strings.

## 6. Query Layer

### 6.1 Previous-period math

For current period `[since, until]` of length `N` days:

- `prev_since = since - N days`
- `prev_until = since - 1 day`

Both series are returned with their **native** dates. Frontend rekeys the previous series onto the current-period axis (index by day-offset-from-start) for chart overlay.

Example (preset 7, today = 2026-04-17):

- Current: `2026-04-11 → 2026-04-17`
- Previous: `2026-04-04 → 2026-04-10`

### 6.2 New query helpers in `lib/queries/paid-media.ts`

**`getKpiDailyWithPrevious(adAccountId, since, until, metricKey)`**

Returns `{ current: Array<{date, value}>, previous: Array<{date, value}>, totals: {current, previous, deltaPct} }`. Runs on-demand when the KPI modal opens (not in initial dashboard load). Aggregates from `meta_insights_daily` (campaign-level) for parity with the KPI totals already shown.

**`getActiveAdsWithKpis(adAccountId, since, until, isEcommerce)`**

Joins `meta_ad_insights_daily` + `meta_ads` + `meta_campaigns`. Aggregates per ad over the period. `HAVING SUM(spend) > 0 OR SUM(conversions) > 0`.

**`getAdDailyWithPrevious(adAccountId, adId, since, until, metricKey)`**

Ad-level equivalent of 6.2's first helper, for the ad drawer's chart.

**`getChangeEventsForAdAccount(adAccountId, since, until, limit, offset, levelFilter?)`**

Primary timeline query. Orders by `occurredAt DESC`. Optional `levelFilter: 'campaign' | 'ad_set' | 'ad'`.

**`getChangeEventsForCampaign(campaignLocalId, limit)`**

For the drawer. Returns events belonging to this campaign across all three entity levels:

- `entityType='campaign' AND entityLocalId=campaignLocalId` — direct campaign events
- `entityType='ad'   AND entityLocalId IN (SELECT id FROM meta_ads WHERE campaignId=campaignLocalId)` — events on ads owned by this campaign
- `entityType='ad_set'` — requires resolving the ad-set-to-campaign relationship. Implementation choice at build time: either (a) at sync time, look up each ad set's `campaign_id` via a single Graph API call and persist it alongside `entityLocalId` (as `parentCampaignMetaId`, a new nullable column), or (b) at query time, look it up on-demand. **Decision:** persist at sync time. Add a nullable column `parentCampaignMetaId text` to `meta_change_events` for ad-set events; null for campaign/ad events. Indexed as `(entityType, parentCampaignMetaId)`.

### 6.3 Chart modal data flow

1. User clicks KPI card → URL gets `?chart=<metricKey>`
2. Modal component reads the param, calls a server action that wraps `getKpiDailyWithPrevious`
3. Skeleton renders with the chart shape while loading
4. Recharts renders with current + previous series

### 6.4 Server action

New file `app/actions/paid-media-chart.ts`:

```ts
"use server";
export async function getKpiChartData(
  adAccountId: string,
  since: string,
  until: string,
  metricKey: string
): Promise<ChartData> { ... }
```

Reuses existing workspace-membership auth check (via `requireUserId` + workspace lookup).

## 7. Filter Unification (Item 4)

Existing `getCampaignsWithKpis` is modified to add `HAVING SUM(spend) > 0 OR SUM(conversions) > 0`. No parameter change — applies unconditionally.

## 8. What This Does Not Include

- **Ad creative preview** beyond storing `creativeId` — actual rendering of creative images/videos in the ad drawer is deferred. Placeholder shown.
- **Weekly recommendations / signal analysis** — change events are captured so sub-project 2 can consume them, but the analysis itself is out of scope here.
- **Retroactive change-event backfill beyond 90 days** — `/activities` typically returns ~37 months, but we cap at 90 for consistency with insights retention.
- **Real-time push via Meta webhooks** — considered and rejected (webhook URL infra + signature verification + retry logic not justified for hourly-freshness analytical data).

## 9. Implementation Order (for the plan)

1. Schema migration (3 new tables + down)
2. `sync-ads.ts` + `sync-changes.ts` helpers + tests against real Meta data (manual)
3. Extend `sync-single-ad-account` and `backfill-meta-ads`
4. Label utility (`lib/meta/labels.ts`) + apply across existing components
5. Query helpers in `lib/queries/paid-media.ts`
6. Campaign filter unification (item 4)
7. KPI chart modal component + server action
8. Ads table component + ad drawer component
9. Change timeline component
10. Extend campaign drawer with ads and changes sections
11. Wire everything into the dashboard page

## 10. Open Items

None. All ambiguities resolved during brainstorming.
