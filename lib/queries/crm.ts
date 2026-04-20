import {
  and,
  eq,
  desc,
  sql,
  isNotNull,
  gte,
  lte,
  count,
  between,
  inArray,
} from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  crmConnections,
  crmPipelines,
  crmStages,
  crmSourceConfig,
  crmDeals,
  crmSources,
} from "@/lib/drizzle/schema";

export type CrmConnectionState =
  | { state: "no_connection" }
  | {
      state: "not_configured";
      connection: {
        id: string;
        provider: string;
        externalCompanyDomain: string | null;
        status: "active" | "expired" | "revoked";
      };
    }
  | {
      state: "mapped";
      connection: {
        id: string;
        provider: string;
        externalCompanyDomain: string | null;
        status: "active" | "expired" | "revoked";
        lastSyncedAt: Date | null;
      };
    };

export async function getCrmConnectionState(
  workspaceId: string,
  accountId: string
): Promise<CrmConnectionState> {
  const rows = await db
    .select()
    .from(crmConnections)
    .where(
      and(
        eq(crmConnections.workspaceId, workspaceId),
        eq(crmConnections.accountId, accountId)
      )
    )
    .orderBy(desc(crmConnections.createdAt))
    .limit(1);

  if (rows.length === 0) return { state: "no_connection" };
  const c = rows[0];

  if (c.catalogsConfiguredAt === null) {
    return {
      state: "not_configured",
      connection: {
        id: c.id,
        provider: c.provider,
        externalCompanyDomain: c.externalCompanyDomain,
        status: c.status as "active" | "expired" | "revoked",
      },
    };
  }
  return {
    state: "mapped",
    connection: {
      id: c.id,
      provider: c.provider,
      externalCompanyDomain: c.externalCompanyDomain,
      status: c.status as "active" | "expired" | "revoked",
      lastSyncedAt: c.lastSyncedAt,
    },
  };
}

export interface MappingPageData {
  pipelines: {
    id: string;
    externalId: string;
    name: string;
    isSynced: boolean;
    stages: {
      id: string;
      externalId: string;
      name: string;
      orderNr: number;
      isSynced: boolean;
      isProposalStage: boolean;
    }[];
  }[];
  sourceConfig: { sourceFieldType: "channel" | "custom"; sourceFieldKey: string } | null;
}

export async function getMappingPageData(connectionId: string): Promise<MappingPageData> {
  const pipelines = await db
    .select({
      id: crmPipelines.id,
      externalId: crmPipelines.externalId,
      name: crmPipelines.name,
      isSynced: crmPipelines.isSynced,
    })
    .from(crmPipelines)
    .where(eq(crmPipelines.connectionId, connectionId));

  const stages = await db
    .select({
      id: crmStages.id,
      pipelineId: crmStages.pipelineId,
      externalId: crmStages.externalId,
      name: crmStages.name,
      orderNr: crmStages.orderNr,
      isSynced: crmStages.isSynced,
      isProposalStage: crmStages.isProposalStage,
    })
    .from(crmStages);

  const cfg = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connectionId))
    .limit(1);

  return {
    pipelines: pipelines.map((p) => ({
      ...p,
      stages: stages
        .filter((s) => s.pipelineId === p.id)
        .sort((a, b) => a.orderNr - b.orderNr)
        .map((s) => ({
          id: s.id,
          externalId: s.externalId,
          name: s.name,
          orderNr: s.orderNr,
          isSynced: s.isSynced,
          isProposalStage: s.isProposalStage,
        })),
    })),
    sourceConfig: cfg.length > 0
      ? { sourceFieldType: cfg[0].sourceFieldType as "channel" | "custom", sourceFieldKey: cfg[0].sourceFieldKey }
      : null,
  };
}

export type CurrencyBucket = { currency: string; total: number };

export interface CrmKpis {
  createdCount: number;
  wonCount: number;
  valueOpen: CurrencyBucket[];
  valueWon: CurrencyBucket[];
}

export async function getCrmKpis(
  connectionId: string,
  since: Date,
  until: Date
): Promise<CrmKpis> {
  const [createdRow] = await db
    .select({ c: count() })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        between(crmDeals.addTime, since, until)
      )
    );

  const [wonRow] = await db
    .select({ c: count() })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        eq(crmDeals.status, "won"),
        isNotNull(crmDeals.wonTime),
        gte(crmDeals.wonTime, since),
        lte(crmDeals.wonTime, until)
      )
    );

  const openBuckets = await db
    .select({
      currency: crmDeals.currency,
      total: sql<number>`COALESCE(SUM(${crmDeals.value}),0)::float`,
    })
    .from(crmDeals)
    .where(and(eq(crmDeals.connectionId, connectionId), eq(crmDeals.status, "open")))
    .groupBy(crmDeals.currency);

  const wonBuckets = await db
    .select({
      currency: crmDeals.currency,
      total: sql<number>`COALESCE(SUM(${crmDeals.value}),0)::float`,
    })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        eq(crmDeals.status, "won"),
        isNotNull(crmDeals.wonTime),
        gte(crmDeals.wonTime, since),
        lte(crmDeals.wonTime, until)
      )
    )
    .groupBy(crmDeals.currency);

  const toBucket = (rows: { currency: string | null; total: number }[]): CurrencyBucket[] =>
    rows.filter((r) => r.currency && r.total > 0).map((r) => ({ currency: r.currency!, total: r.total }));

  return {
    createdCount: createdRow.c,
    wonCount: wonRow.c,
    valueOpen: toBucket(openBuckets),
    valueWon: toBucket(wonBuckets),
  };
}

export interface SourceBreakdownRow {
  sourceExternalId: string | null;
  sourceName: string;
  createdCount: number;
  wonCount: number;
  valueOpen: CurrencyBucket[];
  valueWon: CurrencyBucket[];
}

export async function getCrmBreakdownBySource(
  connectionId: string,
  since: Date,
  until: Date
): Promise<SourceBreakdownRow[]> {
  const created = await db
    .select({
      sourceExternalId: crmDeals.sourceExternalId,
      status: crmDeals.status,
      value: crmDeals.value,
      currency: crmDeals.currency,
      wonTime: crmDeals.wonTime,
    })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        between(crmDeals.addTime, since, until)
      )
    );

  const sourcesRows = await db
    .select()
    .from(crmSources)
    .where(eq(crmSources.connectionId, connectionId));
  const sourceNameById = new Map(sourcesRows.map((s) => [s.externalId, s.name]));

  const bucketMap = new Map<string | null, SourceBreakdownRow>();
  const addValue = (arr: CurrencyBucket[], currency: string | null, value: string | null) => {
    if (!currency || !value) return;
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) return;
    const existing = arr.find((b) => b.currency === currency);
    if (existing) existing.total += n;
    else arr.push({ currency, total: n });
  };

  for (const d of created) {
    const key = d.sourceExternalId;
    let row = bucketMap.get(key);
    if (!row) {
      row = {
        sourceExternalId: key,
        sourceName: key ? sourceNameById.get(key) ?? `(id:${key})` : "(sin fuente)",
        createdCount: 0,
        wonCount: 0,
        valueOpen: [],
        valueWon: [],
      };
      bucketMap.set(key, row);
    }
    row.createdCount++;
    if (d.status === "won" && d.wonTime && d.wonTime >= since && d.wonTime <= until) {
      row.wonCount++;
      addValue(row.valueWon, d.currency, d.value);
    }
    if (d.status === "open") addValue(row.valueOpen, d.currency, d.value);
  }

  return Array.from(bucketMap.values()).sort((a, b) => b.createdCount - a.createdCount);
}

export interface CrmDealListRow {
  id: string;
  externalId: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: "open" | "won";
  stageName: string | null;
  sourceName: string;
  ownerName: string | null;
  personName: string | null;
  orgName: string | null;
  addTime: Date;
}

export interface CrmDealFilters {
  since: Date;
  until: Date;
  sourceExternalIds?: string[];
  stageIds?: string[];
  status?: "open" | "won" | "all";
}

export async function getCrmDeals(
  connectionId: string,
  filters: CrmDealFilters,
  page: number,
  pageSize = 25
): Promise<{ deals: CrmDealListRow[]; totalPages: number }> {
  const conditions = [
    eq(crmDeals.connectionId, connectionId),
    between(crmDeals.addTime, filters.since, filters.until),
  ];
  if (filters.sourceExternalIds && filters.sourceExternalIds.length > 0) {
    conditions.push(inArray(crmDeals.sourceExternalId, filters.sourceExternalIds));
  }
  if (filters.stageIds && filters.stageIds.length > 0) {
    conditions.push(inArray(crmDeals.stageId, filters.stageIds));
  }
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(crmDeals.status, filters.status));
  }

  const whereClause = and(...conditions);

  const [countRow] = await db.select({ c: count() }).from(crmDeals).where(whereClause);
  const totalPages = Math.max(1, Math.ceil(countRow.c / pageSize));

  const rows = await db
    .select({
      id: crmDeals.id,
      externalId: crmDeals.externalId,
      title: crmDeals.title,
      value: crmDeals.value,
      currency: crmDeals.currency,
      status: crmDeals.status,
      stageId: crmDeals.stageId,
      sourceExternalId: crmDeals.sourceExternalId,
      ownerName: crmDeals.ownerName,
      personName: crmDeals.personName,
      orgName: crmDeals.orgName,
      addTime: crmDeals.addTime,
    })
    .from(crmDeals)
    .where(whereClause)
    .orderBy(desc(crmDeals.addTime))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const stageRows = await db
    .select({ id: crmStages.id, name: crmStages.name })
    .from(crmStages)
    .innerJoin(crmPipelines, eq(crmStages.pipelineId, crmPipelines.id))
    .where(eq(crmPipelines.connectionId, connectionId));
  const stageNameById = new Map(stageRows.map((s) => [s.id, s.name]));

  const sourceRows = await db
    .select()
    .from(crmSources)
    .where(eq(crmSources.connectionId, connectionId));
  const sourceNameById = new Map(sourceRows.map((s) => [s.externalId, s.name]));

  return {
    deals: rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      title: r.title,
      value: r.value ? parseFloat(r.value) : null,
      currency: r.currency,
      status: r.status as "open" | "won",
      stageName: r.stageId ? stageNameById.get(r.stageId) ?? null : null,
      sourceName: r.sourceExternalId
        ? sourceNameById.get(r.sourceExternalId) ?? `(id:${r.sourceExternalId})`
        : "(sin fuente)",
      ownerName: r.ownerName,
      personName: r.personName,
      orgName: r.orgName,
      addTime: r.addTime,
    })),
    totalPages,
  };
}

export interface CrmFilterOptions {
  sources: { externalId: string; name: string }[];
  stages: { id: string; name: string }[];
}

export async function getCrmFilterOptions(connectionId: string): Promise<CrmFilterOptions> {
  const sources = await db
    .select({ externalId: crmSources.externalId, name: crmSources.name })
    .from(crmSources)
    .where(eq(crmSources.connectionId, connectionId));
  const stages = await db
    .select({ id: crmStages.id, name: crmStages.name })
    .from(crmStages)
    .innerJoin(crmPipelines, eq(crmStages.pipelineId, crmPipelines.id))
    .where(and(eq(crmPipelines.connectionId, connectionId), eq(crmStages.isSynced, true)));
  return { sources, stages };
}

export interface FunnelRow {
  stageId: string;
  stageName: string;
  pipelineName: string;
  orderNr: number;
  openCount: number;
  isProposalStage: boolean;
}

export async function getCrmFunnel(
  connectionId: string,
  since: Date,
  until: Date
): Promise<{ rows: FunnelRow[]; wonInPeriod: number }> {
  const stages = await db
    .select({
      id: crmStages.id,
      name: crmStages.name,
      orderNr: crmStages.orderNr,
      isProposalStage: crmStages.isProposalStage,
      pipelineId: crmStages.pipelineId,
      pipelineName: crmPipelines.name,
    })
    .from(crmStages)
    .innerJoin(crmPipelines, eq(crmStages.pipelineId, crmPipelines.id))
    .where(
      and(
        eq(crmPipelines.connectionId, connectionId),
        eq(crmPipelines.isSynced, true),
        eq(crmStages.isSynced, true)
      )
    )
    .orderBy(crmPipelines.name, crmStages.orderNr);

  const openByStage = await db
    .select({
      stageId: crmDeals.stageId,
      c: count(),
    })
    .from(crmDeals)
    .where(and(eq(crmDeals.connectionId, connectionId), eq(crmDeals.status, "open")))
    .groupBy(crmDeals.stageId);

  const countMap = new Map<string, number>();
  for (const r of openByStage) if (r.stageId) countMap.set(r.stageId, r.c);

  const [wonRow] = await db
    .select({ c: count() })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        eq(crmDeals.status, "won"),
        isNotNull(crmDeals.wonTime),
        gte(crmDeals.wonTime, since),
        lte(crmDeals.wonTime, until)
      )
    );

  return {
    rows: stages.map((s) => ({
      stageId: s.id,
      stageName: s.name,
      pipelineName: s.pipelineName,
      orderNr: s.orderNr,
      openCount: countMap.get(s.id) ?? 0,
      isProposalStage: s.isProposalStage,
    })),
    wonInPeriod: wonRow.c,
  };
}

export interface CycleTimeStats {
  avgDays: number | null;
  medianDays: number | null;
  wonCount: number;
}

export async function getCrmAvgCloseDays(
  connectionId: string,
  since: Date,
  until: Date
): Promise<CycleTimeStats> {
  const rows = await db
    .select({ addTime: crmDeals.addTime, wonTime: crmDeals.wonTime })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        eq(crmDeals.status, "won"),
        isNotNull(crmDeals.wonTime),
        gte(crmDeals.wonTime, since),
        lte(crmDeals.wonTime, until)
      )
    );

  if (rows.length === 0) return { avgDays: null, medianDays: null, wonCount: 0 };

  const days = rows
    .map((r) => (r.wonTime!.getTime() - r.addTime.getTime()) / 86400_000)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);

  const avg = days.reduce((a, b) => a + b, 0) / days.length;
  const median =
    days.length % 2 === 0
      ? (days[days.length / 2 - 1] + days[days.length / 2]) / 2
      : days[Math.floor(days.length / 2)];

  return {
    avgDays: Math.round(avg * 10) / 10,
    medianDays: Math.round(median * 10) / 10,
    wonCount: rows.length,
  };
}

export interface StalledDeal {
  id: string;
  externalId: string;
  title: string;
  value: number | null;
  currency: string | null;
  stageName: string | null;
  ownerName: string | null;
  daysStalled: number;
  updateTime: Date;
}

export async function getCrmStalledDeals(
  connectionId: string,
  thresholdDays = 14,
  limit = 5
): Promise<StalledDeal[]> {
  const cutoff = new Date(Date.now() - thresholdDays * 86400_000);
  const rows = await db
    .select({
      id: crmDeals.id,
      externalId: crmDeals.externalId,
      title: crmDeals.title,
      value: crmDeals.value,
      currency: crmDeals.currency,
      stageId: crmDeals.stageId,
      ownerName: crmDeals.ownerName,
      updateTime: crmDeals.updateTime,
    })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        eq(crmDeals.status, "open"),
        lte(crmDeals.updateTime, cutoff)
      )
    )
    .orderBy(crmDeals.updateTime)
    .limit(limit);

  const stageRows = await db
    .select({ id: crmStages.id, name: crmStages.name })
    .from(crmStages)
    .innerJoin(crmPipelines, eq(crmStages.pipelineId, crmPipelines.id))
    .where(eq(crmPipelines.connectionId, connectionId));
  const stageNameById = new Map(stageRows.map((s) => [s.id, s.name]));

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    externalId: r.externalId,
    title: r.title,
    value: r.value ? parseFloat(r.value) : null,
    currency: r.currency,
    stageName: r.stageId ? stageNameById.get(r.stageId) ?? null : null,
    ownerName: r.ownerName,
    daysStalled: Math.floor((now - r.updateTime.getTime()) / 86400_000),
    updateTime: r.updateTime,
  }));
}

export interface CrmMiniCardKpis {
  oportunidades: number;
  propuestas: number;
  valuePipeline: CurrencyBucket[];
  wonLast30d: number;
  lastSyncedAt: Date | null;
}

export async function getCrmMiniCardKpis(connectionId: string): Promise<CrmMiniCardKpis> {
  const proposalStages = await db
    .select({ id: crmStages.id })
    .from(crmStages)
    .innerJoin(crmPipelines, eq(crmStages.pipelineId, crmPipelines.id))
    .where(
      and(
        eq(crmPipelines.connectionId, connectionId),
        eq(crmStages.isProposalStage, true)
      )
    );
  const proposalStageIds = proposalStages.map((s) => s.id);

  const [openRow] = await db
    .select({ c: count() })
    .from(crmDeals)
    .where(and(eq(crmDeals.connectionId, connectionId), eq(crmDeals.status, "open")));

  let propuestasCount = 0;
  if (proposalStageIds.length > 0) {
    const [row] = await db
      .select({ c: count() })
      .from(crmDeals)
      .where(
        and(
          eq(crmDeals.connectionId, connectionId),
          eq(crmDeals.status, "open"),
          inArray(crmDeals.stageId, proposalStageIds)
        )
      );
    propuestasCount = row.c;
  }

  const openBuckets = await db
    .select({
      currency: crmDeals.currency,
      total: sql<number>`COALESCE(SUM(${crmDeals.value}),0)::float`,
    })
    .from(crmDeals)
    .where(and(eq(crmDeals.connectionId, connectionId), eq(crmDeals.status, "open")))
    .groupBy(crmDeals.currency);

  const since30 = new Date(Date.now() - 30 * 86400_000);
  const [wonRow] = await db
    .select({ c: count() })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        eq(crmDeals.status, "won"),
        isNotNull(crmDeals.wonTime),
        gte(crmDeals.wonTime, since30)
      )
    );

  const [connRow] = await db
    .select({ lastSyncedAt: crmConnections.lastSyncedAt })
    .from(crmConnections)
    .where(eq(crmConnections.id, connectionId))
    .limit(1);

  return {
    oportunidades: openRow.c,
    propuestas: propuestasCount,
    valuePipeline: openBuckets
      .filter((b) => b.currency && b.total > 0)
      .map((b) => ({ currency: b.currency!, total: b.total })),
    wonLast30d: wonRow.c,
    lastSyncedAt: connRow?.lastSyncedAt ?? null,
  };
}
