import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaAds,
  metaAdInsightsDaily,
} from "@/lib/drizzle/schema";
import { metaGraphFetch } from "./client";

type AdApi = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  creative?: { id: string };
};

type InsightAction = { action_type: string; value: string };

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

function moneyToCents(s: string | undefined): number {
  if (!s) return 0;
  return Math.round(parseFloat(s) * 100);
}

function intOrZero(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function extractConversions(actions: InsightAction[] | undefined, event: string): number {
  if (!actions) return 0;
  const match = actions.find((a) => a.action_type === event);
  return match ? intOrZero(match.value) : 0;
}

function extractConversionValue(
  actionValues: InsightAction[] | undefined,
  event: string
): number | null {
  if (!actionValues) return null;
  const match = actionValues.find((a) => a.action_type === event);
  return match ? moneyToCents(match.value) : null;
}

export async function fetchAndUpsertAds(
  adAccountRowId: string,
  metaAdAccountId: string,
  accessToken: string,
  campaignIdMap: Map<string, string>
): Promise<Map<string, string>> {
  const result = await metaGraphFetch<{ data: AdApi[] }>(
    `/${metaAdAccountId}/ads`,
    {
      accessToken,
      searchParams: {
        fields: "id,name,status,creative{id},campaign_id",
        limit: 500,
      },
    }
  );

  const metaToLocalId = new Map<string, string>();
  const now = new Date();

  for (const ad of result.data) {
    const localCampaignId = campaignIdMap.get(ad.campaign_id);
    if (!localCampaignId) continue; // campaign not synced yet, skip

    const existing = await db
      .select({ id: metaAds.id })
      .from(metaAds)
      .where(and(eq(metaAds.adAccountId, adAccountRowId), eq(metaAds.metaAdId, ad.id)))
      .limit(1);

    const values = {
      adAccountId: adAccountRowId,
      campaignId: localCampaignId,
      metaAdId: ad.id,
      name: ad.name,
      status: ad.status,
      creativeId: ad.creative?.id ?? null,
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
  const result = await metaGraphFetch<{ data: AdInsightApiRow[] }>(
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
  );

  let upserts = 0;
  for (const row of result.data) {
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
