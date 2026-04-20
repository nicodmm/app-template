# Meta Ads — Dynamic Asset Variants (Design Spec)

**Date:** 2026-04-19
**Status:** Approved, ready for implementation plan
**Module:** Meta Ads (sub-project 1c)
**Depends on:** Meta Ads v2 (merged 2026-04-19, commit `a08b48d`)

## Goal

Capture and display per-image performance for Meta ads that use Dynamic Creative Optimization (DCO / Asset Feed), so agency users can see which image in a DCO ad is driving spend, impressions, and conversions.

## Scope

**In scope (MVP):**
- DCO / Asset Feed ads only. Meta exposes per-image breakdowns via `breakdowns=image_asset` on the ad insights endpoint.
- Image variants only. Text and CTA variants are deferred.
- Aggregated totals per variant over the dashboard period (no per-variant time-series chart).
- Table UI inside the existing `PaidMediaAdDrawer`.

**Out of scope:**
- DPA / catalog ads (different breakdown model).
- Text, headline, description, CTA variants.
- Per-variant trend charts (too many mini-charts = noise).
- Cross-ad variant aggregation (e.g. "top images across the whole account"). Query supports it later, no UI for MVP.

## User experience

When a user opens the ad drawer for an ad that has image_asset breakdowns, a new section **"Variantes por imagen"** renders between the trend chart and the existing "Creatividad" preview. It shows a table with one row per image variant, sorted by Inversión desc. Clicking a row opens the existing lightbox with that variant's full-resolution image.

Ads without variants show no section at all — detection is automatic (query returns empty → section hides).

### Table columns

| Column | Source |
|--------|--------|
| Thumbnail (40×40px) | `meta_ad_asset_variants.thumbnail_url` |
| Nombre | `meta_ad_asset_variants.name` (fall back to hash) |
| Inversión | `SUM(spend)` formatted via `formatMoney` |
| Impresiones | `SUM(impressions)` |
| Clicks | `SUM(clicks)` |
| CTR | `clicks / impressions * 100`, two decimals |
| Leads/Ventas | `SUM(conversions)` — label switches with `isEcommerce` like the rest of the module |
| CPA | `spend / conversions` formatted via `formatMoney`, "—" when no conversions |

Row click → `onRowClick(imageUrl)` → drawer opens lightbox with that image.

## Data model

Two new Drizzle tables mirroring the existing `meta_ads` + `meta_ad_insights_daily` pattern. Files live in `lib/drizzle/schema/`.

### `meta_ad_asset_variants` (metadata, one row per variant-per-ad)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | default random |
| `adAccountId` | uuid FK → `meta_ad_accounts(id)` cascade | workspace isolation |
| `adId` | uuid FK → `meta_ads(id)` cascade | |
| `metaAssetHash` | text NOT NULL | hash returned by Meta, stable across syncs |
| `name` | text | friendly name if Meta provides; else caller falls back to hash |
| `imageUrl` | text | full-res URL for the lightbox |
| `thumbnailUrl` | text | table preview |
| `firstSeenAt` | timestamp | set on insert, never updated |
| `lastSyncedAt` | timestamp | updated every sync |
| `createdAt` | timestamp | |

Indexes:
- `UNIQUE (adId, metaAssetHash)` — a variant is scoped to its parent ad
- `INDEX (adId)` — drawer query

The same image uploaded to two ads becomes two rows. Simplifies sync (no cross-ad metadata merging) and matches how Meta reports variants per ad.

### `meta_ad_asset_insights_daily` (daily metrics, mirrors `meta_ad_insights_daily`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `adAccountId` | uuid FK → `meta_ad_accounts(id)` cascade | |
| `assetVariantId` | uuid FK → `meta_ad_asset_variants(id)` cascade | |
| `adId` | uuid FK → `meta_ads(id)` cascade | denormalized for drawer query |
| `date` | date NOT NULL | |
| `spend` | integer DEFAULT 0 | cents, same unit as `meta_ad_insights_daily` |
| `impressions` | integer DEFAULT 0 | |
| `reach` | integer DEFAULT 0 | |
| `clicks` | integer DEFAULT 0 | |
| `conversions` | integer DEFAULT 0 | |
| `conversionValue` | integer | nullable, cents |
| `frequency` | numeric(6,2) | nullable |
| `createdAt` | timestamp | |

Indexes:
- `UNIQUE (adAccountId, assetVariantId, date)` — upsert target
- `INDEX (adId, date)` — drawer query

**No `campaignId` denormalization:** the drawer only queries variants per-ad. If a campaign-level view appears later, derive via join.

### Migration

Drizzle-generated `0008_*.sql` plus a hand-written `0008_*/down.sql` that drops both tables (insights first to respect FK). Must be created BEFORE running `db:migrate`.

## Sync

New helper `lib/meta/sync-asset-variants.ts`, following the shape of `sync-ads.ts`.

### API call

```
GET /{ad_account_id}/insights
  ?level=ad
  &breakdowns=image_asset
  &time_increment=1
  &time_range={since, until}
  &fields=ad_id,image_asset,spend,impressions,reach,clicks,frequency,actions,action_values
  &limit=500
```

Meta returns one row per `(ad, date, image_asset)`. Ads without DCO are simply absent from the response — this IS the detection mechanism. No separate "is this a DCO ad?" probe.

### Helper signature

```ts
export async function fetchAndUpsertAssetInsights(params: {
  adAccountRowId: string;
  metaAdAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  conversionEvent: string;
  isEcommerce: boolean;
  adIdMap: Map<string, string>; // metaAdId -> localAdId, built by fetchAndUpsertAds
}): Promise<number>;
```

Per-row logic:
1. Skip if `row.image_asset` missing or no `hash`.
2. Resolve `localAdId` from `adIdMap`; skip if unknown.
3. Upsert into `meta_ad_asset_variants` with `onConflictDoUpdate` on `(adId, metaAssetHash)`, updating `name`, `imageUrl`, `thumbnailUrl`, `lastSyncedAt`. Return `id`.
4. Upsert into `meta_ad_asset_insights_daily` with `onConflictDoUpdate` on `(adAccountId, assetVariantId, date)`.

Returns the number of daily insight rows upserted (for logging parity with `fetchAndUpsertAdInsights`). Variant upsert count logged separately inside the helper.

### Shared utilities

`moneyToCents`, `intOrZero`, `extractConversions`, `extractConversionValue` currently live as private functions in `sync-ads.ts`. Before the new helper can reuse them, they move to a new file `lib/meta/insights-utils.ts`. Both `sync-ads.ts` and `sync-asset-variants.ts` import from there.

### Integration points

- **Hourly sync** — `trigger/tasks/sync-single-ad-account.ts`: after `fetchAndUpsertAdInsights`, call `fetchAndUpsertAssetInsights` with the same date range and the `adIdMap` already built. Log upsert count.
- **90-day backfill** — `trigger/tasks/backfill-meta-ads.ts`: same sequence inside the monthly chunk loop that already handles ad insights.

### Retention

Follows the same pattern as `meta_ad_insights_daily` today: rows are not actively pruned. The 90-day working window is enforced by the backfill range, not by deletion. Older rows accumulate but at negligible size (one account × handful of variants × 90 days is small). If the sibling `meta_ad_insights_daily` gets a prune job later, extend it to `meta_ad_asset_insights_daily` at the same cutoff. Variants (`meta_ad_asset_variants`) are not time-pruned regardless — they are metadata and are only removed via FK cascade when the parent ad is deleted.

## Query

Single new function in `lib/queries/paid-media.ts`, following `getActiveAdsWithKpis`.

```ts
export type AssetVariantRow = {
  id: string;
  metaAssetHash: string;
  name: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  spend: number;        // cents
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;          // percent
  cpa: number;          // currency units (not cents)
};

export async function getAssetVariantsForAd(
  adId: string,
  since: string,
  until: string
): Promise<AssetVariantRow[]>;
```

Shape:
- `FROM meta_ad_asset_variants v`
- `INNER JOIN meta_ad_asset_insights_daily d ON d.asset_variant_id = v.id AND d.date BETWEEN since AND until`
- `WHERE v.ad_id = adId`
- `GROUP BY v.id`
- Aggregates: `COALESCE(SUM(...), 0)::int` for each metric
- `ORDER BY SUM(d.spend) DESC`
- CTR and CPA computed in JS after the SQL round-trip, matching the existing pattern

**INNER JOIN** so variants with no spend in the period don't appear — consistent with "no data → no row → no section".

## UI

### Server Action

Add `getAssetVariantsForAdAction(adId, since, until)` to `app/actions/paid-media-drawer.ts` (the existing drawer-scoped action file). Wraps `getAssetVariantsForAd`. Workspace guard follows the pattern used by the other actions in that file.

### New component: `components/paid-media-asset-variants-section.tsx`

```tsx
interface Props {
  adId: string;
  since: string;
  until: string;
  currency: string;
  isEcommerce: boolean;
  onRowClick: (imageUrl: string) => void;
}
```

Behavior:
- On mount / prop change: call server action via `useTransition`
- While loading: render nothing (avoids empty-section flicker)
- On empty result: render nothing (no variants → section hidden)
- On non-empty: render `<h3>Variantes por imagen</h3>` and the table

Table rendering:
- Wrapper div with `overflow-x-auto` for mobile
- Tabular numbers right-aligned (`text-right tabular-nums`)
- Row click: `onRowClick(row.imageUrl ?? row.thumbnailUrl)` — if both are null, the row is not clickable (no `onClick`, no cursor-pointer). This only happens when Meta returns a variant hash without any image URL, which is rare.
- Thumbnail 40×40 with `object-cover rounded` fallback when no URL
- Formatters reused: `formatMoney`, `formatMetricValue` from `lib/meta/format`

### Integration into `PaidMediaAdDrawer`

Placement: between the existing trend chart block and the "Creatividad" block.

Lightbox parameterization (small refactor):
- Replace `previewOpen: boolean` state with `previewUrl: string | null`
- Main creative button: `onClick={() => setPreviewUrl(ad.thumbnailUrl)}`
- Variant row click handler passed as `onRowClick={setPreviewUrl}`
- Escape / click-outside / close button: `setPreviewUrl(null)`
- Lightbox renders when `previewUrl != null`, uses `previewUrl` as `src` instead of hardcoded `ad.thumbnailUrl`

### Labels

Extend `lib/meta/labels.ts` with:
- `assetVariants: "Variantes por imagen"`
- `assetName: "Nombre"`

All other metric labels (spend, impressions, clicks, ctr, conversions, cpa) are already defined and reused.

## Verification

Manual (no test infra, per module convention):
1. `npm run db:generate` → create migration + hand-written down.sql
2. `npm run db:migrate` → apply
3. `npm run type-check` passes
4. Run hourly sync via Trigger.dev dev → confirm new table populates for a DCO ad
5. Run 90-day backfill → confirm daily rows across range
6. Open drawer for DCO ad in browser → verify section renders, rows sorted by spend desc, totals sum correctly, row click opens lightbox with the right image
7. Open drawer for non-DCO ad → verify section absent

## Files touched

**New:**
- `lib/drizzle/schema/meta_ad_asset_variants.ts`
- `lib/drizzle/schema/meta_ad_asset_insights_daily.ts`
- `lib/meta/sync-asset-variants.ts`
- `lib/meta/insights-utils.ts`
- `components/paid-media-asset-variants-section.tsx`
- `drizzle/migrations/0008_<name>.sql`
- `drizzle/migrations/0008_<name>/down.sql`

**Modified:**
- `lib/drizzle/schema/index.ts` (export new schemas)
- `lib/meta/sync-ads.ts` (move helpers to `insights-utils.ts`, import them)
- `lib/queries/paid-media.ts` (add `getAssetVariantsForAd`, `AssetVariantRow` type)
- `app/actions/paid-media-drawer.ts` (add `getAssetVariantsForAdAction`)
- `trigger/tasks/sync-single-ad-account.ts` (call new helper)
- `trigger/tasks/backfill-meta-ads.ts` (call new helper in chunk loop)
- `lib/meta/labels.ts` (two new keys)
- `components/paid-media-ad-drawer.tsx` (lightbox parameterization + new section)
