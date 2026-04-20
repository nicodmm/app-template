import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaAdAssetVariants,
  metaAdAssetInsightsDaily,
} from "@/lib/drizzle/schema";
import { paginate } from "./client";
import { resolveImageUrlsByHash } from "./images";
import {
  moneyToCents,
  intOrZero,
  extractConversions,
  extractConversionValue,
  type InsightAction,
} from "./insights-utils";

type ImageAsset = {
  hash?: string;
  name?: string;
  image_url?: string;
  thumbnail_url?: string;
};

type AssetInsightApiRow = {
  date_start: string;
  ad_id?: string;
  image_asset?: ImageAsset;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  frequency?: string;
  actions?: InsightAction[];
  action_values?: InsightAction[];
};

export async function fetchAndUpsertAssetInsights(params: {
  adAccountRowId: string;
  metaAdAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  conversionEvent: string;
  isEcommerce: boolean;
  adIdMap: Map<string, string>; // metaAdId -> localAdId
}): Promise<number> {
  const now = new Date();
  const variantCache = new Map<string, string>(); // key: `${localAdId}::${hash}` -> variantId
  const seenHashes = new Set<string>();
  let variantUpserts = 0;
  let insightUpserts = 0;

  for await (const row of paginate<AssetInsightApiRow>(
    `/${params.metaAdAccountId}/insights`,
    {
      accessToken: params.accessToken,
      searchParams: {
        level: "ad",
        breakdowns: "image_asset",
        time_increment: 1,
        time_range: JSON.stringify({ since: params.since, until: params.until }),
        fields:
          "ad_id,spend,impressions,reach,clicks,frequency,actions,action_values",
        limit: 500,
      },
    }
  )) {
    if (!row.ad_id || !row.date_start) continue;
    const localAdId = params.adIdMap.get(row.ad_id);
    if (!localAdId) continue;

    const asset = row.image_asset;
    if (!asset?.hash) continue; // non-DCO ad rows have no image_asset

    seenHashes.add(asset.hash);
    const cacheKey = `${localAdId}::${asset.hash}`;
    let variantId = variantCache.get(cacheKey);

    if (!variantId) {
      const existing = await db
        .select({ id: metaAdAssetVariants.id })
        .from(metaAdAssetVariants)
        .where(
          and(
            eq(metaAdAssetVariants.adId, localAdId),
            eq(metaAdAssetVariants.metaAssetHash, asset.hash)
          )
        )
        .limit(1);

      const variantValues = {
        adAccountId: params.adAccountRowId,
        adId: localAdId,
        metaAssetHash: asset.hash,
        name: asset.name ?? null,
        imageUrl: asset.image_url ?? null,
        thumbnailUrl: asset.thumbnail_url ?? null,
        lastSyncedAt: now,
      };

      if (existing.length > 0) {
        await db
          .update(metaAdAssetVariants)
          .set(variantValues)
          .where(eq(metaAdAssetVariants.id, existing[0].id));
        variantId = existing[0].id;
      } else {
        const inserted = await db
          .insert(metaAdAssetVariants)
          .values(variantValues)
          .returning({ id: metaAdAssetVariants.id });
        variantId = inserted[0].id;
      }

      variantCache.set(cacheKey, variantId);
      variantUpserts++;
    }

    const insightValues = {
      adAccountId: params.adAccountRowId,
      assetVariantId: variantId,
      adId: localAdId,
      date: row.date_start,
      spend: moneyToCents(row.spend),
      impressions: intOrZero(row.impressions),
      reach: intOrZero(row.reach),
      clicks: intOrZero(row.clicks),
      conversions: extractConversions(row.actions, params.conversionEvent),
      conversionValue: params.isEcommerce
        ? extractConversionValue(row.action_values, params.conversionEvent)
        : null,
      frequency: row.frequency ? row.frequency : null,
    };

    await db
      .insert(metaAdAssetInsightsDaily)
      .values(insightValues)
      .onConflictDoUpdate({
        target: [
          metaAdAssetInsightsDaily.adAccountId,
          metaAdAssetInsightsDaily.assetVariantId,
          metaAdAssetInsightsDaily.date,
        ],
        set: {
          spend: insightValues.spend,
          impressions: insightValues.impressions,
          reach: insightValues.reach,
          clicks: insightValues.clicks,
          conversions: insightValues.conversions,
          conversionValue: insightValues.conversionValue,
          frequency: insightValues.frequency,
        },
      });
    insightUpserts++;
  }

  // Resolve image URLs in batch (Meta insights breakdowns don't include URLs)
  if (seenHashes.size > 0) {
    const resolved = await resolveImageUrlsByHash(
      params.metaAdAccountId,
      params.accessToken,
      Array.from(seenHashes)
    );
    for (const [hash, img] of resolved.entries()) {
      if (!img.url && !img.thumbnailUrl) continue;
      await db
        .update(metaAdAssetVariants)
        .set({ imageUrl: img.url, thumbnailUrl: img.thumbnailUrl, lastSyncedAt: now })
        .where(eq(metaAdAssetVariants.metaAssetHash, hash));
    }
  }

  console.log(
    `[sync-asset-variants] ad_account=${params.metaAdAccountId} variants_upserted=${variantUpserts} daily_rows_upserted=${insightUpserts} urls_resolved=${seenHashes.size}`
  );
  return insightUpserts;
}
