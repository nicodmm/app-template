# Meta Ads — Nested Creative Image Resolution (Design Spec)

**Date:** 2026-04-20
**Status:** Approved, ready for implementation plan
**Module:** Meta Ads (deferred item from Dynamic Asset Variants)
**Depends on:** Meta Ads v2 (merged 2026-04-19, commit `a08b48d`), Dynamic Asset Variants (merged 2026-04-20, commit `5f4a2cc`)
**Branch:** `meta-ads-nested-creatives`

## Goal

Populate `meta_ads.image_url` for ads where Meta does NOT return `creative.image_url` or `creative.image_hash` at the top level — specifically link ads, video ads, and carousel ads — so that the "Creatividad" section's lightbox in `PaidMediaAdDrawer` renders the full-resolution image instead of falling back to the low-res `thumbnail_url`.

Today, ~7/7 ads on the test account have `image_url = null` because their creative is carousel, video, or DCO. DCO is already covered by the Dynamic Asset Variants table (merged 2026-04-20); this spec targets the remaining three types with a lean fallback to pick one representative image per ad.

## Scope

**In scope (lean coverage):**
- Link ads — read from `creative.object_story_spec.link_data.{image_url,image_hash}`.
- Video ads — read from `creative.object_story_spec.video_data.{image_url,image_hash}` (video frame thumbnail).
- Carousel ads — read from the **first** element of `creative.object_story_spec.link_data.child_attachments[]` (`{image_url,image_hash}`). Single representative image, not a gallery.
- Batched hash-to-URL resolution via the existing `resolveImageUrlsByHash()` helper — a single batched call per sync regardless of which path the hash came from.

**Out of scope:**
- DCO / asset feed (`asset_feed_spec.images[]`) — already covered by the Dynamic Asset Variants table per-variant row. The single "Creatividad" slot stays `null` for DCO ads; lightbox falls back to `thumbnail_url`, which is acceptable because users open the variant row instead.
- Carousel gallery UI — no multi-image lightbox. First child only.
- New DB columns. `meta_ads.image_url` (migration 0009) and `meta_ads.thumbnail_url` already exist; this spec only populates them more completely.
- UI changes. `PaidMediaAdDrawer` already consumes `imageUrl` (full-res) with `thumbnailUrl` as fallback at `components/paid-media-ad-drawer.tsx:187-199`. No component change needed.

## Implementation

### File: `lib/meta/sync-ads.ts`

1. **Extend `AdApi.creative` type** to include `object_story_spec` with nested `link_data` (including `child_attachments[]`) and `video_data`.

2. **Extend `fields` query param** in the `/{metaAdAccountId}/ads` call to request the nested paths:

   ```
   creative{
     id,
     thumbnail_url,
     image_url,
     image_hash,
     object_story_spec{
       link_data{image_url,image_hash,child_attachments},
       video_data{image_url,image_hash}
     }
   }
   ```

3. **New pure helper `extractCreativeImage(creative)`** in `sync-ads.ts` (inline — ~15 lines, not worth a new file). Returns `{ imageUrl: string | null, imageHash: string | null }` by walking this preference order:

   1. `creative.image_url` → imageUrl
   2. `creative.image_hash` → imageHash
   3. `creative.object_story_spec.link_data.image_url` → imageUrl
   4. `creative.object_story_spec.link_data.image_hash` → imageHash
   5. `creative.object_story_spec.link_data.child_attachments[0].image_url` → imageUrl (carousel)
   6. `creative.object_story_spec.link_data.child_attachments[0].image_hash` → imageHash (carousel)
   7. `creative.object_story_spec.video_data.image_url` → imageUrl (video thumb)
   8. `creative.object_story_spec.video_data.image_hash` → imageHash
   9. `{ imageUrl: null, imageHash: null }`

   First match wins. Returning at most one of the two — `imageUrl` if Meta gave us a direct URL anywhere in the tree, otherwise `imageHash` for later resolution.

4. **Pipeline change inside `fetchAndUpsertAds`:**

   - Pass 1 over `ads[]`: call `extractCreativeImage(ad.creative)` for each, collect all non-null `imageHash` values into a Set.
   - Single `resolveImageUrlsByHash(metaAdAccountId, accessToken, [...hashes])` batch call (unchanged helper).
   - Pass 2 (the existing upsert loop): for each ad, use the extracted `{ imageUrl, imageHash }` and compose:
     - `imageUrl = extracted.imageUrl ?? (extracted.imageHash ? resolvedByHash.get(extracted.imageHash)?.url ?? null : null)`
     - `thumbnailUrl = creative.thumbnail_url ?? (extracted.imageHash ? resolvedByHash.get(extracted.imageHash)?.thumbnailUrl ?? null : null)`

   The rest of the upsert `values` object stays identical.

### No other files change

- `lib/meta/images.ts` — untouched, `resolveImageUrlsByHash()` already does what we need.
- `lib/meta/sync-asset-variants.ts` — untouched, DCO flow unchanged.
- `components/paid-media-ad-drawer.tsx` — untouched, already consumes `imageUrl`.
- Schema / migrations — untouched.

## Verification

No automated tests (module has no test infra per existing convention — manual + type-check + Trigger.dev dev logs).

1. `npm run type-check` passes.
2. Baseline query before running: `SELECT name, status, creative_id IS NOT NULL AS has_creative, image_url IS NOT NULL AS has_url FROM meta_ads WHERE ad_account_id = <test>;` — record the `has_url = false` count.
3. Re-map the ad account on `/app/settings/integrations` to force the backfill (memory: "auto-backfill on re-mapping" shipped in `fe4bf95`).
4. Re-run the same query. `has_url = true` count should increase by roughly the number of link/video/carousel ads. DCO ads remain `has_url = false` (expected).
5. Open `PaidMediaAdDrawer` on:
   - A video ad → lightbox shows full-res video thumb, not blurry.
   - A carousel ad → lightbox shows first child image, full-res.
   - A link ad → lightbox shows full-res.
   - A DCO ad → lightbox falls back to `thumbnail_url` (expected; user opens variant rows instead).
6. Trigger.dev dev logs: the next hourly `meta-ads-hourly-sync` run completes without new errors referencing `creative.object_story_spec`.

## Risks and considerations

- **Response size bloat.** Adding `object_story_spec` with `child_attachments` to the `fields` param will increase payload per ad. `/ads` is already paginated via `paginate()`; no additional change. If Meta trims response under size pressure, the fallback chain still produces `{null, null}` safely.
- **Unknown creative shapes.** Meta's creative schema is large and undocumented-in-parts. The helper returns `{null, null}` on any unrecognized shape and the existing `thumbnail_url` fallback still renders in the UI, so a miss degrades gracefully to today's behavior.
- **No DB migration** means rollback is trivial: revert the branch, next sync re-overwrites `image_url` with whatever the top-level fields produce (today's state).
- **Carousel "first child"** is a deliberate simplification. If users later ask for a gallery, the stored `imageUrl` becomes the hero image and a new `meta_ad_carousel_children` table plus UI can be layered on without rewriting this work.
