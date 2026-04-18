import { and, eq, sql, gte, lte, desc } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaAdAccounts,
  metaCampaigns,
  metaInsightsDaily,
  metaConnections,
} from "@/lib/drizzle/schema";

export type PaidMediaConnectionState =
  | { state: "no_connection" }
  | { state: "no_mapping"; connectionStatus: "active" | "expired" | "revoked"; connectionId: string }
  | {
      state: "mapped";
      connectionStatus: "active" | "expired" | "revoked";
      adAccount: {
        id: string;
        metaAdAccountId: string;
        name: string;
        currency: string;
        timezone: string;
        status: number;
        isEcommerce: boolean;
        conversionEvent: string;
        lastSyncedAt: Date | null;
      };
    };

export async function getPaidMediaState(
  workspaceId: string,
  accountId: string
): Promise<PaidMediaConnectionState> {
  const connections = await db
    .select({ id: metaConnections.id, status: metaConnections.status })
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspaceId))
    .limit(1);

  if (connections.length === 0) return { state: "no_connection" };
  const conn = connections[0];

  const ad = await db
    .select()
    .from(metaAdAccounts)
    .where(
      and(
        eq(metaAdAccounts.workspaceId, workspaceId),
        eq(metaAdAccounts.accountId, accountId)
      )
    )
    .limit(1);

  if (ad.length === 0) {
    return {
      state: "no_mapping",
      connectionStatus: conn.status as "active" | "expired" | "revoked",
      connectionId: conn.id,
    };
  }

  return {
    state: "mapped",
    connectionStatus: conn.status as "active" | "expired" | "revoked",
    adAccount: {
      id: ad[0].id,
      metaAdAccountId: ad[0].metaAdAccountId,
      name: ad[0].name,
      currency: ad[0].currency,
      timezone: ad[0].timezone,
      status: ad[0].status,
      isEcommerce: ad[0].isEcommerce,
      conversionEvent: ad[0].conversionEvent,
      lastSyncedAt: ad[0].lastSyncedAt,
    },
  };
}

export type KpiSet = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  conversionValue: number | null;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number | null;
};

function computeDerived(base: Omit<KpiSet, "ctr" | "cpc" | "cpm" | "cpa" | "roas">): KpiSet {
  const { spend, impressions, clicks, conversions, conversionValue } = base;
  return {
    ...base,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks / 100 : 0,
    cpm: impressions > 0 ? ((spend / impressions) * 1000) / 100 : 0,
    cpa: conversions > 0 ? spend / conversions / 100 : 0,
    roas: conversionValue != null && spend > 0 ? conversionValue / spend : null,
  };
}

export async function getKpisForRange(
  adAccountId: string,
  since: string,
  until: string
): Promise<KpiSet> {
  const rows = await db
    .select({
      spend: sql<number>`COALESCE(SUM(${metaInsightsDaily.spend}), 0)::int`,
      impressions: sql<number>`COALESCE(SUM(${metaInsightsDaily.impressions}), 0)::int`,
      reach: sql<number>`COALESCE(SUM(${metaInsightsDaily.reach}), 0)::int`,
      clicks: sql<number>`COALESCE(SUM(${metaInsightsDaily.clicks}), 0)::int`,
      conversions: sql<number>`COALESCE(SUM(${metaInsightsDaily.conversions}), 0)::int`,
      conversionValue: sql<number | null>`SUM(${metaInsightsDaily.conversionValue})::int`,
      frequency: sql<number>`COALESCE(AVG(${metaInsightsDaily.frequency}), 0)::float`,
    })
    .from(metaInsightsDaily)
    .where(
      and(
        eq(metaInsightsDaily.adAccountId, adAccountId),
        gte(metaInsightsDaily.date, since),
        lte(metaInsightsDaily.date, until)
      )
    );
  const r = rows[0];
  return computeDerived({
    spend: r.spend,
    impressions: r.impressions,
    reach: r.reach,
    clicks: r.clicks,
    conversions: r.conversions,
    conversionValue: r.conversionValue,
    frequency: r.frequency,
  });
}

export type KpisWithDelta = {
  current: KpiSet;
  previous: KpiSet;
  deltas: Record<keyof KpiSet, number | null>;
};

function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

export async function getKpisWithComparison(
  adAccountId: string,
  since: string,
  until: string
): Promise<KpisWithDelta> {
  const start = new Date(since);
  const end = new Date(until);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [current, previous] = await Promise.all([
    getKpisForRange(adAccountId, since, until),
    getKpisForRange(adAccountId, iso(prevStart), iso(prevEnd)),
  ]);

  const keys = Object.keys(current) as (keyof KpiSet)[];
  const deltas = {} as Record<keyof KpiSet, number | null>;
  for (const k of keys) {
    const c = current[k];
    const p = previous[k];
    deltas[k] = pctDelta(
      typeof c === "number" ? c : null,
      typeof p === "number" ? p : null
    );
  }
  return { current, previous, deltas };
}

export type CampaignRow = {
  id: string;
  metaCampaignId: string;
  name: string;
  status: string;
  objective: string | null;
  dailyBudget: number | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpa: number;
};

export async function getCampaignsWithKpis(
  adAccountId: string,
  since: string,
  until: string
): Promise<CampaignRow[]> {
  const rows = await db
    .select({
      id: metaCampaigns.id,
      metaCampaignId: metaCampaigns.metaCampaignId,
      name: metaCampaigns.name,
      status: metaCampaigns.status,
      objective: metaCampaigns.objective,
      dailyBudget: metaCampaigns.dailyBudget,
      spend: sql<number>`COALESCE(SUM(${metaInsightsDaily.spend}), 0)::int`,
      impressions: sql<number>`COALESCE(SUM(${metaInsightsDaily.impressions}), 0)::int`,
      reach: sql<number>`COALESCE(SUM(${metaInsightsDaily.reach}), 0)::int`,
      clicks: sql<number>`COALESCE(SUM(${metaInsightsDaily.clicks}), 0)::int`,
      conversions: sql<number>`COALESCE(SUM(${metaInsightsDaily.conversions}), 0)::int`,
      frequency: sql<number>`COALESCE(AVG(${metaInsightsDaily.frequency}), 0)::float`,
    })
    .from(metaCampaigns)
    .leftJoin(
      metaInsightsDaily,
      and(
        eq(metaInsightsDaily.campaignId, metaCampaigns.id),
        gte(metaInsightsDaily.date, since),
        lte(metaInsightsDaily.date, until)
      )
    )
    .where(eq(metaCampaigns.adAccountId, adAccountId))
    .groupBy(metaCampaigns.id)
    .having(
      sql`COALESCE(SUM(${metaInsightsDaily.spend}), 0) > 0 OR COALESCE(SUM(${metaInsightsDaily.conversions}), 0) > 0`
    );

  return rows.map((r) => ({
    id: r.id,
    metaCampaignId: r.metaCampaignId,
    name: r.name,
    status: r.status,
    objective: r.objective,
    dailyBudget: r.dailyBudget,
    spend: r.spend,
    impressions: r.impressions,
    reach: r.reach,
    clicks: r.clicks,
    conversions: r.conversions,
    frequency: r.frequency,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpc: r.clicks > 0 ? r.spend / r.clicks / 100 : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions / 100 : 0,
  }));
}

export type CampaignTrendPoint = {
  date: string;
  spend: number;
  conversions: number;
};

export async function getCampaignTrend(
  campaignId: string,
  days: number = 30
): Promise<CampaignTrendPoint[]> {
  const today = new Date();
  const since = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      date: metaInsightsDaily.date,
      spend: sql<number>`${metaInsightsDaily.spend}::int`,
      conversions: sql<number>`${metaInsightsDaily.conversions}::int`,
    })
    .from(metaInsightsDaily)
    .where(
      and(
        eq(metaInsightsDaily.campaignId, campaignId),
        gte(metaInsightsDaily.date, since)
      )
    )
    .orderBy(desc(metaInsightsDaily.date));
  return rows.map((r) => ({ date: r.date, spend: r.spend, conversions: r.conversions }));
}
