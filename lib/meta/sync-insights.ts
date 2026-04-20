import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaCampaigns,
  metaInsightsDaily,
  metaAdAccounts,
  metaConnections,
} from "@/lib/drizzle/schema";
import { metaGraphFetch, paginate } from "./client";

type CampaignApi = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
};

type InsightAction = { action_type: string; value: string };

type InsightApiRow = {
  date_start: string;
  date_stop: string;
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

function extractConversions(
  actions: InsightAction[] | undefined,
  event: string
): number {
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

export async function fetchAndUpsertCampaigns(
  adAccountRowId: string,
  metaAdAccountId: string,
  accessToken: string
): Promise<Map<string, string>> {
  const result = await metaGraphFetch<{ data: CampaignApi[] }>(
    `/${metaAdAccountId}/campaigns`,
    {
      accessToken,
      searchParams: {
        fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
        limit: 200,
      },
    }
  );

  const metaToLocalId = new Map<string, string>();
  const now = new Date();

  for (const c of result.data) {
    const existing = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .where(
        and(
          eq(metaCampaigns.adAccountId, adAccountRowId),
          eq(metaCampaigns.metaCampaignId, c.id)
        )
      )
      .limit(1);

    const values = {
      adAccountId: adAccountRowId,
      metaCampaignId: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective ?? null,
      dailyBudget: c.daily_budget ? parseInt(c.daily_budget, 10) : null,
      lifetimeBudget: c.lifetime_budget ? parseInt(c.lifetime_budget, 10) : null,
      startTime: c.start_time ? new Date(c.start_time) : null,
      stopTime: c.stop_time ? new Date(c.stop_time) : null,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (existing.length > 0) {
      await db.update(metaCampaigns).set(values).where(eq(metaCampaigns.id, existing[0].id));
      metaToLocalId.set(c.id, existing[0].id);
    } else {
      const inserted = await db
        .insert(metaCampaigns)
        .values(values)
        .returning({ id: metaCampaigns.id });
      metaToLocalId.set(c.id, inserted[0].id);
    }
  }

  return metaToLocalId;
}

export async function fetchAndUpsertInsights(params: {
  adAccountRowId: string;
  metaAdAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  conversionEvent: string;
  isEcommerce: boolean;
  campaignIdMap: Map<string, string>;
}): Promise<number> {
  let upserts = 0;
  for await (const row of paginate<InsightApiRow>(
    `/${params.metaAdAccountId}/insights`,
    {
      accessToken: params.accessToken,
      searchParams: {
        level: "campaign",
        time_increment: 1,
        time_range: JSON.stringify({ since: params.since, until: params.until }),
        fields: "campaign_id,spend,impressions,reach,clicks,frequency,actions,action_values",
        limit: 500,
      },
    }
  )) {
    if (!row.campaign_id || !row.date_start) continue;
    const localCampaignId = params.campaignIdMap.get(row.campaign_id);
    if (!localCampaignId) continue;

    const values = {
      adAccountId: params.adAccountRowId,
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
      .insert(metaInsightsDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [
          metaInsightsDaily.adAccountId,
          metaInsightsDaily.campaignId,
          metaInsightsDaily.date,
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

export async function getAdAccountWithConnection(adAccountRowId: string) {
  const rows = await db
    .select({
      adAccount: metaAdAccounts,
      accessToken: metaConnections.accessToken,
      connectionStatus: metaConnections.status,
    })
    .from(metaAdAccounts)
    .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
    .where(eq(metaAdAccounts.id, adAccountRowId))
    .limit(1);
  return rows[0] ?? null;
}
