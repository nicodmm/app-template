# Meta Ads — Nested Creative Image Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `meta_ads.image_url` for link / video / carousel ads by walking nested creative paths (`object_story_spec.link_data`, `video_data`, `child_attachments[0]`) so the `PaidMediaAdDrawer` lightbox renders full-res instead of falling back to `thumbnail_url`.

**Architecture:** Single-file change in `lib/meta/sync-ads.ts`. Extend the `fields` param of `/ads` to request nested paths, add a pure helper `extractCreativeImage()` that picks one `{imageUrl,imageHash}` pair in a preference order, then refactor the existing two-pass upsert (hash collection → batch resolve → upsert) to source both pieces from the helper. No DB migration, no component change, no new files.

**Tech Stack:** TypeScript, Drizzle ORM, Meta Graph API v20.0, existing `paginate()` + `resolveImageUrlsByHash()` helpers in `lib/meta/`.

**Testing convention:** This module follows the project-wide "no test infra" rule documented in CLAUDE.md and memory — verification is `npm run type-check` + manual re-map-and-inspect on `/app/settings/integrations`. Do not introduce a test runner or test files.

**Branch:** `meta-ads-nested-creatives` (already created from master).

**Spec:** `docs/superpowers/specs/2026-04-20-meta-ads-nested-creatives-design.md` (commit `246e6b6`).

---

### Task 1: Extend `AdApi.creative` type and `/ads` fields param

**Files:**
- Modify: `lib/meta/sync-ads.ts:17-28` (type), `lib/meta/sync-ads.ts:53-54` (fields string)

- [ ] **Step 1: Extend the `AdApi.creative` type to cover the nested paths**

Replace the current `creative?: { ... }` block (lines 22-27) with the shape below. Do not touch any other property.

```ts
type AdCreativeChildAttachment = {
  image_hash?: string;
  image_url?: string;
};

type AdCreativeLinkData = {
  image_hash?: string;
  image_url?: string;
  child_attachments?: AdCreativeChildAttachment[];
};

type AdCreativeVideoData = {
  image_hash?: string;
  image_url?: string;
};

type AdApi = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  creative?: {
    id: string;
    thumbnail_url?: string;
    image_url?: string;
    image_hash?: string;
    object_story_spec?: {
      link_data?: AdCreativeLinkData;
      video_data?: AdCreativeVideoData;
    };
  };
};
```

- [ ] **Step 2: Extend the `fields` query param in the `/ads` call**

At `lib/meta/sync-ads.ts:53-54`, replace the existing `fields` string literal with the multi-line template below (broken across lines for readability; the Graph API accepts commas and whitespace inside the nested blocks):

```ts
      fields: [
        "id",
        "name",
        "status",
        "campaign_id",
        "creative{id,thumbnail_url,image_url,image_hash,object_story_spec{link_data{image_url,image_hash,child_attachments},video_data{image_url,image_hash}}}",
      ].join(","),
```

Rationale for the join-array style: keeps the long nested-creative string isolated on its own entry so future edits don't fight a 200-char single line.

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: PASS. No new errors. The new nested types are referenced only by `AdApi`; existing call sites of `fetchAndUpsertAds` are untouched.

- [ ] **Step 4: Commit**

```bash
git add lib/meta/sync-ads.ts
git commit -m "feat(meta-ads): extend creative type + fields for nested paths"
```

---

### Task 2: Add `extractCreativeImage` helper

**Files:**
- Modify: `lib/meta/sync-ads.ts` (insert new function between the type block and `fetchAndUpsertAds`, i.e. after the closing brace of `AdInsightApiRow` at line 41, before `export async function fetchAndUpsertAds` at line 43)

- [ ] **Step 1: Add the helper function**

Insert this block immediately after the `AdInsightApiRow` type and before `fetchAndUpsertAds`. The function is pure, sync, and returns either a URL or a hash (never both) or nulls.

```ts
type ExtractedCreativeImage = {
  imageUrl: string | null;
  imageHash: string | null;
};

function extractCreativeImage(
  creative: AdApi["creative"]
): ExtractedCreativeImage {
  if (!creative) return { imageUrl: null, imageHash: null };

  if (creative.image_url) return { imageUrl: creative.image_url, imageHash: null };
  if (creative.image_hash) return { imageUrl: null, imageHash: creative.image_hash };

  const linkData = creative.object_story_spec?.link_data;
  if (linkData?.image_url) return { imageUrl: linkData.image_url, imageHash: null };
  if (linkData?.image_hash) return { imageUrl: null, imageHash: linkData.image_hash };

  const firstChild = linkData?.child_attachments?.[0];
  if (firstChild?.image_url) return { imageUrl: firstChild.image_url, imageHash: null };
  if (firstChild?.image_hash) return { imageUrl: null, imageHash: firstChild.image_hash };

  const videoData = creative.object_story_spec?.video_data;
  if (videoData?.image_url) return { imageUrl: videoData.image_url, imageHash: null };
  if (videoData?.image_hash) return { imageUrl: null, imageHash: videoData.image_hash };

  return { imageUrl: null, imageHash: null };
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: PASS. Helper is unused so far — TypeScript will not warn (project has no `noUnusedLocals` per convention; if it does, move to Task 3 immediately after this step without committing).

- [ ] **Step 3: Commit**

```bash
git add lib/meta/sync-ads.ts
git commit -m "feat(meta-ads): add extractCreativeImage helper"
```

---

### Task 3: Refactor upsert pipeline to use the helper

**Files:**
- Modify: `lib/meta/sync-ads.ts:61-100` (hash collection + per-ad upsert)

- [ ] **Step 1: Replace the hash-collection block**

Replace the current block at `lib/meta/sync-ads.ts:61-65`:

```ts
  const hashesToResolve = Array.from(
    new Set(
      ads.map((ad) => ad.creative?.image_hash).filter((h): h is string => !!h)
    )
  );
```

with:

```ts
  const extractedByAdId = new Map<string, ExtractedCreativeImage>();
  for (const ad of ads) {
    extractedByAdId.set(ad.id, extractCreativeImage(ad.creative));
  }

  const hashesToResolve = Array.from(
    new Set(
      Array.from(extractedByAdId.values())
        .map((e) => e.imageHash)
        .filter((h): h is string => !!h)
    )
  );
```

Why the Map: `extractCreativeImage` is cheap, but we want to call it exactly once per ad and share the result between the collection pass and the upsert pass. Looking it up by `ad.id` inside the upsert loop is O(1).

- [ ] **Step 2: Replace the per-ad upsert block**

Replace the current block at `lib/meta/sync-ads.ts:85-97` (from `const resolved = ...` through the `values` object's `imageUrl` line — keep `lastSyncedAt` and `updatedAt`):

```ts
    const resolved = ad.creative?.image_hash
      ? resolvedByHash.get(ad.creative.image_hash)
      : undefined;

    const values = {
      adAccountId: adAccountRowId,
      campaignId: localCampaignId,
      metaAdId: ad.id,
      name: ad.name,
      status: ad.status,
      creativeId: ad.creative?.id ?? null,
      thumbnailUrl: ad.creative?.thumbnail_url ?? resolved?.thumbnailUrl ?? null,
      imageUrl: ad.creative?.image_url ?? resolved?.url ?? null,
      lastSyncedAt: now,
      updatedAt: now,
    };
```

with:

```ts
    const extracted = extractedByAdId.get(ad.id) ?? {
      imageUrl: null,
      imageHash: null,
    };
    const resolved = extracted.imageHash
      ? resolvedByHash.get(extracted.imageHash)
      : undefined;

    const values = {
      adAccountId: adAccountRowId,
      campaignId: localCampaignId,
      metaAdId: ad.id,
      name: ad.name,
      status: ad.status,
      creativeId: ad.creative?.id ?? null,
      thumbnailUrl: ad.creative?.thumbnail_url ?? resolved?.thumbnailUrl ?? null,
      imageUrl: extracted.imageUrl ?? resolved?.url ?? null,
      lastSyncedAt: now,
      updatedAt: now,
    };
```

Diff to read carefully:
- `resolved` now keys on the extracted hash (which may come from any nested path), not the top-level one.
- `imageUrl` prefers `extracted.imageUrl` (any direct URL Meta returned anywhere in the tree) before falling back to the resolved hash lookup.
- `thumbnailUrl` unchanged in shape: top-level `creative.thumbnail_url` first, then the resolver's `url_128` for whichever hash produced the image. This gives carousels/videos a matching low-res thumb.

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: PASS. No new type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/meta/sync-ads.ts
git commit -m "feat(meta-ads): resolve image_url from nested creative paths"
```

---

### Task 4: Manual verification and finalization

**Files:** none modified; verification only.

- [ ] **Step 1: Type-check the full repo one more time**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 2: Run the lint pass**

Run: `npm run lint`
Expected: PASS. If it flags the unused local `AdCreativeChildAttachment` / `AdCreativeLinkData` / `AdCreativeVideoData` types added in Task 1, they are used transitively via `AdApi["creative"]` and should not warn; if they do, inline them into the `creative` block instead of naming them separately. (Preferred form for lint-clean output is the named-types form because it makes future extension cheaper — only inline as a fallback.)

- [ ] **Step 3: Record the baseline BEFORE running a sync**

Connect to the app's Postgres (Supabase) via the same credentials used by `lib/drizzle/db.ts`. Find the ad account row id to filter on:

```sql
SELECT id, meta_ad_account_id, name FROM meta_ad_accounts;
```

Pick the test ad account. Then:

```sql
SELECT
  COUNT(*) AS total,
  COUNT(image_url) AS with_url,
  COUNT(*) - COUNT(image_url) AS without_url
FROM meta_ads
WHERE ad_account_id = '<test-row-id>';
```

Record the three numbers. Expected pre-change: `with_url` is low (memory says ~0/7 for the test account).

- [ ] **Step 4: Trigger a backfill via re-mapping**

Start the dev server in one terminal:

```bash
npm run dev
```

Start the Trigger.dev dev runner in a second terminal (the backfill task runs on Trigger):

```bash
npx trigger.dev@latest dev
```

In the browser, go to `/app/settings/integrations` → click the Meta Ads ad account row → re-select the same mapping and save. This triggers the auto-backfill path (`fe4bf95`, `fetchAndUpsertAds` runs as part of it). Watch the Trigger.dev dev logs for the `meta-ads-backfill` run to complete.

- [ ] **Step 5: Re-run the baseline query**

Same SQL as Step 3. Expected: `with_url` increases for every link / video / carousel ad on the account. DCO ads remain without URL (expected — they are covered by the variants table).

- [ ] **Step 6: Inspect the drawer for each creative type**

Navigate to `/app/ads` (or wherever `PaidMediaAdDrawer` is opened from in this repo — typically the campaign detail page) and open the drawer for:
- A **video** ad → click the Creatividad thumbnail → lightbox should render the video frame in full resolution (not blurry).
- A **carousel** ad → same check → lightbox should render the first child image in full resolution.
- A **link** ad → same check → full resolution.
- A **DCO** ad → Creatividad still falls back to `thumbnail_url` (blurry in lightbox is **expected** here); the Variantes por imagen section below it should still render correctly (regression check — we did not touch that code path).

If any ad type regresses, inspect the value of `meta_ads.image_url` for that ad and trace back through `extractCreativeImage` — the most likely cause is Meta returning an unexpected shape on the nested path for that particular ad. Do NOT patch by lowering the type strictness; instead add the missing shape as an explicit branch in the helper.

- [ ] **Step 7: Trigger dev logs sanity**

In the Trigger.dev dev output, confirm the next scheduled `meta-ads-hourly-sync` run (or trigger it manually via the Trigger.dev dashboard) completes with no new errors. Watch specifically for:
- `error: 100` from Meta (indicates a field-combination rejection — would mean the nested `fields` query is malformed).
- `TypeError: Cannot read properties of undefined` from `sync-ads.ts` (would mean a branch in `extractCreativeImage` is missing a null-guard).

Expected: clean run.

- [ ] **Step 8: Stop dev servers and finalize**

```
Ctrl+C in both dev terminals
```

Then check the branch state:

```bash
git log --oneline master..HEAD
```

Expected: 4 commits — the spec (already committed as `246e6b6`) + the 3 feature commits from Tasks 1-3.

- [ ] **Step 9: Push the branch for review**

```bash
git push -u origin meta-ads-nested-creatives
```

Merge decision is out of scope for this plan — the user will decide between fast-forward merge to master vs. waiting to batch with the pending `crm-integration` merge.

---

## Notes for the implementer

- **Don't `git add -A`.** Memory-level rule on this repo. The working tree contains a large pile of WIP files from other modules. Always stage the exact path you changed.
- **Don't touch `lib/meta/images.ts`.** The existing `resolveImageUrlsByHash()` already does the batched `/adimages` call correctly. Any perceived "improvement" here is out of scope.
- **Don't touch `lib/meta/sync-asset-variants.ts` or the DCO flow.** DCO visibility is handled by the variants table, not by `meta_ads.image_url`.
- **No new columns.** `meta_ads.image_url` and `meta_ads.thumbnail_url` already exist (migration 0009).
- **No component change.** `PaidMediaAdDrawer` at `components/paid-media-ad-drawer.tsx:187-199` already consumes `imageUrl` with a `thumbnailUrl` fallback.
- **The helper must be pure and synchronous.** It runs per-ad in memory; introducing any I/O (e.g. an extra Graph call inside it) would fan out to N requests and defeat the batching.
- **First carousel child is intentional.** If a future task asks for a gallery, that is a separate feature with its own table and UI.
