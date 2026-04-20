import { and, eq, sql, gte, lte, desc, or, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaAdAccounts,
  metaCampaigns,
  metaInsightsDaily,
  metaConnections,
  metaAds,
  metaAdInsightsDaily,
  metaChangeEvents,
  metaAdAssetVariants,
  metaAdAssetInsightsDaily,
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

// ---------------------------------------------------------------------------
// Task 8: Active ads with KPIs
// ---------------------------------------------------------------------------

export type AdRow = {
  id: string;
  metaAdId: string;
  name: string;
  status: string;
  campaignId: string;
  campaignName: string;
  creativeId: string | null;
  thumbnailUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa: number;
};

export async function getActiveAdsWithKpis(
  adAccountId: string,
  since: string,
  until: string
): Promise<AdRow[]> {
  const rows = await db
    .select({
      id: metaAds.id,
      metaAdId: metaAds.metaAdId,
      name: metaAds.name,
      status: metaAds.status,
      campaignId: metaAds.campaignId,
      campaignName: metaCampaigns.name,
      creativeId: metaAds.creativeId,
      thumbnailUrl: metaAds.thumbnailUrl,
      spend: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.spend}), 0)::int`,
      impressions: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.impressions}), 0)::int`,
      clicks: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.clicks}), 0)::int`,
      conversions: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.conversions}), 0)::int`,
    })
    .from(metaAds)
    .innerJoin(metaCampaigns, eq(metaCampaigns.id, metaAds.campaignId))
    .leftJoin(
      metaAdInsightsDaily,
      and(
        eq(metaAdInsightsDaily.adId, metaAds.id),
        gte(metaAdInsightsDaily.date, since),
        lte(metaAdInsightsDaily.date, until)
      )
    )
    .where(eq(metaAds.adAccountId, adAccountId))
    .groupBy(metaAds.id, metaCampaigns.name)
    .having(
      sql`COALESCE(SUM(${metaAdInsightsDaily.spend}), 0) > 0 OR COALESCE(SUM(${metaAdInsightsDaily.conversions}), 0) > 0`
    );

  return rows.map((r) => ({
    id: r.id,
    metaAdId: r.metaAdId,
    name: r.name,
    status: r.status,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    creativeId: r.creativeId,
    thumbnailUrl: r.thumbnailUrl,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions / 100 : 0,
  }));
}

// ---------------------------------------------------------------------------
// Task 8: Daily KPI with previous period
// ---------------------------------------------------------------------------

export type DailyPoint = { date: string; value: number };
export type MetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "conversions"
  | "conversionValue"
  | "frequency"
  | "ctr"
  | "cpm"
  | "cpa"
  | "roas";

export type DailyWithPrevious = {
  current: DailyPoint[];
  previous: DailyPoint[];
  totals: { current: number; previous: number; deltaPct: number | null };
};

function rangeDays(since: string, until: string): number {
  const s = new Date(since).getTime();
  const u = new Date(until).getTime();
  return Math.max(1, Math.round((u - s) / 86400000) + 1);
}

function isoShift(d: string, offsetDays: number): string {
  return new Date(new Date(d).getTime() + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);
}

async function fetchDailyRows(adAccountId: string, since: string, until: string) {
  return db
    .select({
      date: metaInsightsDaily.date,
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
    )
    .groupBy(metaInsightsDaily.date)
    .orderBy(metaInsightsDaily.date);
}

function projectMetric(
  row: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    conversionValue: number | null;
    frequency: number;
  },
  key: MetricKey
): number {
  switch (key) {
    case "spend":
      return row.spend;
    case "impressions":
      return row.impressions;
    case "reach":
      return row.reach;
    case "clicks":
      return row.clicks;
    case "conversions":
      return row.conversions;
    case "conversionValue":
      return row.conversionValue ?? 0;
    case "frequency":
      return row.frequency;
    case "ctr":
      return row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
    case "cpm":
      return row.impressions > 0 ? ((row.spend / row.impressions) * 1000) / 100 : 0;
    case "cpa":
      return row.conversions > 0 ? row.spend / row.conversions / 100 : 0;
    case "roas":
      return row.conversionValue != null && row.spend > 0
        ? row.conversionValue / row.spend
        : 0;
  }
}

export async function getKpiDailyWithPrevious(
  adAccountId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const days = rangeDays(since, until);
  const prevUntil = isoShift(since, -1);
  const prevSince = isoShift(since, -days);

  const [currentRows, previousRows] = await Promise.all([
    fetchDailyRows(adAccountId, since, until),
    fetchDailyRows(adAccountId, prevSince, prevUntil),
  ]);

  const current: DailyPoint[] = currentRows.map((r) => ({
    date: r.date,
    value: projectMetric(r, metric),
  }));
  const previous: DailyPoint[] = previousRows.map((r) => ({
    date: r.date,
    value: projectMetric(r, metric),
  }));

  const totalCurrent = current.reduce((a, b) => a + b.value, 0);
  const totalPrevious = previous.reduce((a, b) => a + b.value, 0);
  const deltaPct =
    totalPrevious === 0
      ? totalCurrent === 0
        ? 0
        : null
      : ((totalCurrent - totalPrevious) / totalPrevious) * 100;

  return {
    current,
    previous,
    totals: { current: totalCurrent, previous: totalPrevious, deltaPct },
  };
}

export async function getCampaignDailyWithPrevious(
  adAccountId: string,
  campaignId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const days = rangeDays(since, until);
  const prevUntil = isoShift(since, -1);
  const prevSince = isoShift(since, -days);

  async function fetchCampaignDailyRows(s: string, u: string) {
    return db
      .select({
        date: metaInsightsDaily.date,
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
          eq(metaInsightsDaily.campaignId, campaignId),
          gte(metaInsightsDaily.date, s),
          lte(metaInsightsDaily.date, u)
        )
      )
      .groupBy(metaInsightsDaily.date)
      .orderBy(metaInsightsDaily.date);
  }

  const [currentRows, previousRows] = await Promise.all([
    fetchCampaignDailyRows(since, until),
    fetchCampaignDailyRows(prevSince, prevUntil),
  ]);

  const current = currentRows.map((r) => ({ date: r.date, value: projectMetric(r, metric) }));
  const previous = previousRows.map((r) => ({ date: r.date, value: projectMetric(r, metric) }));
  const totalCurrent = current.reduce((a, b) => a + b.value, 0);
  const totalPrevious = previous.reduce((a, b) => a + b.value, 0);
  const deltaPct =
    totalPrevious === 0
      ? totalCurrent === 0
        ? 0
        : null
      : ((totalCurrent - totalPrevious) / totalPrevious) * 100;

  return { current, previous, totals: { current: totalCurrent, previous: totalPrevious, deltaPct } };
}

// ---------------------------------------------------------------------------
// Task 8: Change events
// ---------------------------------------------------------------------------

export type ChangeEventRow = {
  id: string;
  entityType: "campaign" | "ad_set" | "ad";
  entityMetaId: string;
  entityLocalId: string | null;
  eventType: string;
  eventData: Record<string, unknown>;
  occurredAt: Date;
  entityName: string | null;
  campaignName: string | null;
};

export async function getChangeEventsForAdAccount(
  adAccountId: string,
  since: string,
  until: string,
  limit: number,
  offset: number,
  levelFilter?: "campaign" | "ad_set" | "ad"
): Promise<ChangeEventRow[]> {
  const conditions = [
    eq(metaChangeEvents.adAccountId, adAccountId),
    gte(metaChangeEvents.occurredAt, new Date(since)),
    lte(metaChangeEvents.occurredAt, new Date(new Date(until).getTime() + 86400000 - 1)),
  ];
  if (levelFilter) conditions.push(eq(metaChangeEvents.entityType, levelFilter));

  const rows = await db
    .select({
      id: metaChangeEvents.id,
      entityType: metaChangeEvents.entityType,
      entityMetaId: metaChangeEvents.entityMetaId,
      entityLocalId: metaChangeEvents.entityLocalId,
      eventType: metaChangeEvents.eventType,
      eventData: metaChangeEvents.eventData,
      rawActivity: metaChangeEvents.rawActivity,
      parentCampaignMetaId: metaChangeEvents.parentCampaignMetaId,
      occurredAt: metaChangeEvents.occurredAt,
      campaignName: metaCampaigns.name,
      adName: metaAds.name,
    })
    .from(metaChangeEvents)
    .leftJoin(
      metaCampaigns,
      and(
        eq(metaChangeEvents.entityType, "campaign"),
        eq(metaChangeEvents.entityLocalId, metaCampaigns.id)
      )
    )
    .leftJoin(
      metaAds,
      and(
        eq(metaChangeEvents.entityType, "ad"),
        eq(metaChangeEvents.entityLocalId, metaAds.id)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(metaChangeEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => {
    const raw = r.rawActivity as { object_name?: string } | null;
    const entityName =
      r.entityType === "campaign"
        ? r.campaignName
        : r.entityType === "ad"
        ? r.adName
        : raw?.object_name ?? null;
    return {
      id: r.id,
      entityType: r.entityType as "campaign" | "ad_set" | "ad",
      entityMetaId: r.entityMetaId,
      entityLocalId: r.entityLocalId,
      eventType: r.eventType,
      eventData: r.eventData as Record<string, unknown>,
      occurredAt: r.occurredAt,
      entityName,
      campaignName: r.campaignName,
    };
  });
}

export async function getChangeEventsForCampaign(
  campaignLocalId: string,
  limit: number = 20
): Promise<ChangeEventRow[]> {
  const campaign = await db
    .select({ id: metaCampaigns.id, metaCampaignId: metaCampaigns.metaCampaignId })
    .from(metaCampaigns)
    .where(eq(metaCampaigns.id, campaignLocalId))
    .limit(1);
  if (campaign.length === 0) return [];

  const adIds = await db
    .select({ id: metaAds.id })
    .from(metaAds)
    .where(eq(metaAds.campaignId, campaignLocalId));
  const adIdList = adIds.map((a) => a.id);

  const rows = await db
    .select({
      id: metaChangeEvents.id,
      entityType: metaChangeEvents.entityType,
      entityMetaId: metaChangeEvents.entityMetaId,
      entityLocalId: metaChangeEvents.entityLocalId,
      eventType: metaChangeEvents.eventType,
      eventData: metaChangeEvents.eventData,
      rawActivity: metaChangeEvents.rawActivity,
      occurredAt: metaChangeEvents.occurredAt,
    })
    .from(metaChangeEvents)
    .where(
      or(
        and(
          eq(metaChangeEvents.entityType, "campaign"),
          eq(metaChangeEvents.entityLocalId, campaignLocalId)
        ),
        and(
          eq(metaChangeEvents.entityType, "ad_set"),
          eq(metaChangeEvents.parentCampaignMetaId, campaign[0].metaCampaignId)
        ),
        adIdList.length > 0
          ? and(
              eq(metaChangeEvents.entityType, "ad"),
              inArray(metaChangeEvents.entityLocalId, adIdList)
            )
          : sql`false`
      )
    )
    .orderBy(desc(metaChangeEvents.occurredAt))
    .limit(limit);

  return rows.map((r) => {
    const raw = r.rawActivity as { object_name?: string } | null;
    return {
      id: r.id,
      entityType: r.entityType as "campaign" | "ad_set" | "ad",
      entityMetaId: r.entityMetaId,
      entityLocalId: r.entityLocalId,
      eventType: r.eventType,
      eventData: r.eventData as Record<string, unknown>,
      occurredAt: r.occurredAt,
      entityName: raw?.object_name ?? null,
      campaignName: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Task 8: Ad-level daily with previous period
// ---------------------------------------------------------------------------

export async function getAdDailyWithPrevious(
  adAccountId: string,
  adId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const days = rangeDays(since, until);
  const prevUntil = isoShift(since, -1);
  const prevSince = isoShift(since, -days);

  async function fetchAdDailyRows(s: string, u: string) {
    return db
      .select({
        date: metaAdInsightsDaily.date,
        spend: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.spend}), 0)::int`,
        impressions: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.impressions}), 0)::int`,
        reach: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.reach}), 0)::int`,
        clicks: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.clicks}), 0)::int`,
        conversions: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.conversions}), 0)::int`,
        conversionValue: sql<number | null>`SUM(${metaAdInsightsDaily.conversionValue})::int`,
        frequency: sql<number>`COALESCE(AVG(${metaAdInsightsDaily.frequency}), 0)::float`,
      })
      .from(metaAdInsightsDaily)
      .where(
        and(
          eq(metaAdInsightsDaily.adAccountId, adAccountId),
          eq(metaAdInsightsDaily.adId, adId),
          gte(metaAdInsightsDaily.date, s),
          lte(metaAdInsightsDaily.date, u)
        )
      )
      .groupBy(metaAdInsightsDaily.date)
      .orderBy(metaAdInsightsDaily.date);
  }

  const [currentRows, previousRows] = await Promise.all([
    fetchAdDailyRows(since, until),
    fetchAdDailyRows(prevSince, prevUntil),
  ]);

  const current = currentRows.map((r) => ({ date: r.date, value: projectMetric(r, metric) }));
  const previous = previousRows.map((r) => ({ date: r.date, value: projectMetric(r, metric) }));
  const totalCurrent = current.reduce((a, b) => a + b.value, 0);
  const totalPrevious = previous.reduce((a, b) => a + b.value, 0);
  const deltaPct =
    totalPrevious === 0
      ? totalCurrent === 0
        ? 0
        : null
      : ((totalCurrent - totalPrevious) / totalPrevious) * 100;

  return { current, previous, totals: { current: totalCurrent, previous: totalPrevious, deltaPct } };
}

// ---------------------------------------------------------------------------
// Task 6: Asset variants per ad
// ---------------------------------------------------------------------------

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
): Promise<AssetVariantRow[]> {
  const rows = await db
    .select({
      id: metaAdAssetVariants.id,
      metaAssetHash: metaAdAssetVariants.metaAssetHash,
      name: metaAdAssetVariants.name,
      imageUrl: metaAdAssetVariants.imageUrl,
      thumbnailUrl: metaAdAssetVariants.thumbnailUrl,
      spend: sql<number>`COALESCE(SUM(${metaAdAssetInsightsDaily.spend}), 0)::int`,
      impressions: sql<number>`COALESCE(SUM(${metaAdAssetInsightsDaily.impressions}), 0)::int`,
      clicks: sql<number>`COALESCE(SUM(${metaAdAssetInsightsDaily.clicks}), 0)::int`,
      conversions: sql<number>`COALESCE(SUM(${metaAdAssetInsightsDaily.conversions}), 0)::int`,
    })
    .from(metaAdAssetVariants)
    .innerJoin(
      metaAdAssetInsightsDaily,
      and(
        eq(metaAdAssetInsightsDaily.assetVariantId, metaAdAssetVariants.id),
        gte(metaAdAssetInsightsDaily.date, since),
        lte(metaAdAssetInsightsDaily.date, until)
      )
    )
    .where(eq(metaAdAssetVariants.adId, adId))
    .groupBy(metaAdAssetVariants.id)
    .orderBy(sql`COALESCE(SUM(${metaAdAssetInsightsDaily.spend}), 0) DESC`);

  return rows.map((r) => ({
    id: r.id,
    metaAssetHash: r.metaAssetHash,
    name: r.name,
    imageUrl: r.imageUrl,
    thumbnailUrl: r.thumbnailUrl,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions / 100 : 0,
  }));
}
