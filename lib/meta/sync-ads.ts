import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaAds,
  metaAdInsightsDaily,
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

type AdCreativeChildAttachment = {
  image_hash?: string;
};

type AdCreativeLinkData = {
  image_hash?: string;
  child_attachments?: AdCreativeChildAttachment[];
};

type AdCreativeVideoData = {
  image_hash?: string;
};

type AdApi = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  creative?: {
    id: string;
    thumbnail_url?: string;
    // Meta deprecated `image_url` everywhere on AdCreative in v19+ —
    // any field request that includes it returns "(#100) Tried
    // accessing nonexisting field (image_url)" and aborts the whole
    // /ads paginate. We now rely exclusively on image_hash (resolved
    // via the AdImage endpoint a few lines below) plus thumbnail_url
    // as the fallback display image.
    image_hash?: string;
    object_story_spec?: {
      link_data?: AdCreativeLinkData;
      video_data?: AdCreativeVideoData;
    };
  };
};

type AdInsightApiRow = {
  date_start: string;
  ad_id?: string;
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  frequency?: string;
  actions?: InsightAction[];
  action_values?: InsightAction[];
};

type ExtractedCreativeImage = {
  imageUrl: string | null;
  imageHash: string | null;
};

function extractCreativeImage(
  creative: AdApi["creative"]
): ExtractedCreativeImage {
  if (!creative) return { imageUrl: null, imageHash: null };

  if (creative.image_hash) return { imageUrl: null, imageHash: creative.image_hash };

  const linkData = creative.object_story_spec?.link_data;
  if (linkData?.image_hash) return { imageUrl: null, imageHash: linkData.image_hash };

  const firstChild = linkData?.child_attachments?.[0];
  if (firstChild?.image_hash) return { imageUrl: null, imageHash: firstChild.image_hash };

  const videoData = creative.object_story_spec?.video_data;
  if (videoData?.image_hash) return { imageUrl: null, imageHash: videoData.image_hash };

  // Last resort: thumbnail from the creative itself (always allowed).
  if (creative.thumbnail_url) {
    return { imageUrl: creative.thumbnail_url, imageHash: null };
  }

  return { imageUrl: null, imageHash: null };
}

export async function fetchAndUpsertAds(
  adAccountRowId: string,
  metaAdAccountId: string,
  accessToken: string,
  campaignIdMap: Map<string, string>
): Promise<Map<string, string>> {
  const ads: AdApi[] = [];
  for await (const ad of paginate<AdApi>(`/${metaAdAccountId}/ads`, {
    accessToken,
    searchParams: {
      fields: [
        "id",
        "name",
        "status",
        "campaign_id",
        // image_url was deprecated everywhere on AdCreative in Graph API
        // v19+ — including the previously-safe nested paths inside
        // object_story_spec. We request ONLY image_hash + thumbnail_url
        // and resolve hashes to URLs via the AdImage endpoint below.
        "creative{id,thumbnail_url,image_hash,object_story_spec{link_data{image_hash,child_attachments{image_hash}},video_data{image_hash}}}",
      ].join(","),
      limit: 500,
    },
  })) {
    ads.push(ad);
  }

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
  const resolvedByHash = await resolveImageUrlsByHash(
    metaAdAccountId,
    accessToken,
    hashesToResolve
  );

  const metaToLocalId = new Map<string, string>();
  const now = new Date();

  for (const ad of ads) {
    const localCampaignId = campaignIdMap.get(ad.campaign_id);
    if (!localCampaignId) continue; // campaign not synced yet, skip

    const existing = await db
      .select({ id: metaAds.id })
      .from(metaAds)
      .where(and(eq(metaAds.adAccountId, adAccountRowId), eq(metaAds.metaAdId, ad.id)))
      .limit(1);

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

    if (existing.length > 0) {
      await db.update(metaAds).set(values).where(eq(metaAds.id, existing[0].id));
      metaToLocalId.set(ad.id, existing[0].id);
    } else {
      const inserted = await db.insert(metaAds).values(values).returning({ id: metaAds.id });
      metaToLocalId.set(ad.id, inserted[0].id);
    }
  }

  return metaToLocalId;
}

export async function fetchAndUpsertAdInsights(params: {
  adAccountRowId: string;
  metaAdAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  conversionEvent: string;
  isEcommerce: boolean;
  adIdMap: Map<string, string>; // metaAdId -> localAdId
  campaignIdMap: Map<string, string>; // metaCampaignId -> localCampaignId
}): Promise<number> {
  let upserts = 0;
  for await (const row of paginate<AdInsightApiRow>(
    `/${params.metaAdAccountId}/insights`,
    {
      accessToken: params.accessToken,
      searchParams: {
        level: "ad",
        time_increment: 1,
        time_range: JSON.stringify({ since: params.since, until: params.until }),
        fields:
          "ad_id,campaign_id,spend,impressions,reach,clicks,frequency,actions,action_values",
        limit: 500,
      },
    }
  )) {
    if (!row.ad_id || !row.campaign_id || !row.date_start) continue;
    const localAdId = params.adIdMap.get(row.ad_id);
    const localCampaignId = params.campaignIdMap.get(row.campaign_id);
    if (!localAdId || !localCampaignId) continue;

    const values = {
      adAccountId: params.adAccountRowId,
      adId: localAdId,
      campaignId: localCampaignId,
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
      .insert(metaAdInsightsDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [
          metaAdInsightsDaily.adAccountId,
          metaAdInsightsDaily.adId,
          metaAdInsightsDaily.date,
        ],
        set: {
          spend: values.spend,
          impressions: values.impressions,
          reach: values.reach,
          clicks: values.clicks,
          conversions: values.conversions,
          conversionValue: values.conversionValue,
          frequency: values.frequency,
        },
      });
    upserts++;
  }
  return upserts;
}
