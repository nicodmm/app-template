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
        "creative{id,thumbnail_url,image_url,image_hash,object_story_spec{link_data{image_url,image_hash,child_attachments},video_data{image_url,image_hash}}}",
      ].join(","),
      limit: 500,
    },
  })) {
    ads.push(ad);
  }

  const hashesToResolve = Array.from(
    new Set(
      ads.map((ad) => ad.creative?.image_hash).filter((h): h is string => !!h)
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
