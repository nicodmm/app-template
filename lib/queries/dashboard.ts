import { db } from "@/lib/drizzle/db";
import {
  accounts,
  transcripts,
  contextDocuments,
  signals,
} from "@/lib/drizzle/schema";
import { and, eq, isNull, gte, lte, inArray, sql } from "drizzle-orm";

const HEALTH_BUCKETS = ["green", "yellow", "red", "inactive"] as const;
export type HealthBucket = (typeof HEALTH_BUCKETS)[number];

export interface DashboardScope {
  workspaceId: string;
  userId: string;
  role: string;
}

export interface DashboardPeriod {
  /** YYYY-MM-DD inclusive */
  since: string;
  /** YYYY-MM-DD inclusive */
  until: string;
}

export interface DashboardSnapshot {
  /** Total active accounts in scope. */
  totalAccounts: number;
  /** Distribution by health_signal — always includes all four buckets. */
  healthDistribution: Record<HealthBucket, number>;
  /** Sum of fee across accounts with non-null fee. */
  feeTotal: number;
  /** Average fee. Null when no account has a fee. */
  ticketAverage: number | null;
  /** Average duration in months across active + closed in scope. Null when no account has start_date. */
  durationMonthsAverage: number | null;
  /** ticketAverage × durationMonthsAverage. Null when either input is null. */
  ltv: number | null;
  /** Count of accounts in scope without fee — used for the "X accounts without fee" hint. */
  accountsWithoutFee: number;
  /** Count of distinct accounts with active upsell/growth signals created in window. */
  opportunitiesCount: number;
  /** Top 10 accounts by transcripts + context_documents in window. */
  topActivity: Array<{
    accountId: string;
    accountName: string;
    fee: number | null;
    transcriptsCount: number;
    documentsCount: number;
    activityCount: number;
  }>;
  /** Distribution by industry. Sorted desc by count. */
  industries: Array<{ industry: string; count: number }>;
  /** Distribution by employee_count. Sorted desc by count. */
  sizes: Array<{ employeeCount: string; count: number }>;
}

function scopeConditions(scope: DashboardScope) {
  const conds = [
    eq(accounts.workspaceId, scope.workspaceId),
    isNull(accounts.closedAt),
  ];
  if (scope.role !== "owner" && scope.role !== "admin") {
    conds.push(eq(accounts.ownerId, scope.userId));
  }
  return conds;
}

export async function getWorkspaceDashboardSnapshot(
  scope: DashboardScope,
  period: DashboardPeriod
): Promise<DashboardSnapshot> {
  const baseConds = scopeConditions(scope);

  // Single fetch of the active accounts in scope; reused for snapshot KPIs.
  const inScopeAccounts = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      fee: accounts.fee,
      startDate: accounts.startDate,
      closedAt: accounts.closedAt,
      healthSignal: accounts.healthSignal,
      industry: accounts.industry,
      employeeCount: accounts.employeeCount,
    })
    .from(accounts)
    .where(and(...baseConds));

  const totalAccounts = inScopeAccounts.length;

  // Health distribution: initialize all buckets to 0.
  const healthDistribution: Record<HealthBucket, number> = {
    green: 0,
    yellow: 0,
    red: 0,
    inactive: 0,
  };
  for (const a of inScopeAccounts) {
    const bucket = (HEALTH_BUCKETS as readonly string[]).includes(
      a.healthSignal ?? "inactive"
    )
      ? ((a.healthSignal ?? "inactive") as HealthBucket)
      : "inactive";
    healthDistribution[bucket] += 1;
  }

  // Fee aggregates.
  const feesNumeric = inScopeAccounts
    .map((a) => (a.fee !== null ? Number(a.fee) : null))
    .filter((n): n is number => n !== null && Number.isFinite(n));
  const feeTotal = feesNumeric.reduce((acc, n) => acc + n, 0);
  const ticketAverage =
    feesNumeric.length > 0 ? feeTotal / feesNumeric.length : null;
  const accountsWithoutFee = totalAccounts - feesNumeric.length;

  // Duration average (months).
  const MS_PER_MONTH = 1000 * 60 * 60 * 24 * (365.25 / 12);
  const durations: number[] = [];
  for (const a of inScopeAccounts) {
    if (!a.startDate) continue;
    const start = new Date(a.startDate).getTime();
    const end = a.closedAt ? new Date(a.closedAt).getTime() : Date.now();
    const months = (end - start) / MS_PER_MONTH;
    if (Number.isFinite(months) && months >= 0) durations.push(months);
  }
  const durationMonthsAverage =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

  const ltv =
    ticketAverage !== null && durationMonthsAverage !== null
      ? ticketAverage * durationMonthsAverage
      : null;

  // Window-scoped queries: opportunities + top activity.
  const accountIds = inScopeAccounts.map((a) => a.id);
  const sinceDate = new Date(`${period.since}T00:00:00Z`);
  const untilDate = new Date(`${period.until}T23:59:59.999Z`);

  let opportunitiesCount = 0;
  let topActivity: DashboardSnapshot["topActivity"] = [];
  let industries: DashboardSnapshot["industries"] = [];
  let sizes: DashboardSnapshot["sizes"] = [];

  if (accountIds.length > 0) {
    const [oppRows, transcriptRows, docRows] = await Promise.all([
      db
        .select({ accountId: signals.accountId })
        .from(signals)
        .where(
          and(
            inArray(signals.accountId, accountIds),
            inArray(signals.type, ["upsell_opportunity", "growth_opportunity"]),
            eq(signals.status, "active"),
            gte(signals.createdAt, sinceDate),
            lte(signals.createdAt, untilDate)
          )
        ),
      db
        .select({
          accountId: transcripts.accountId,
          count: sql<number>`count(*)::int`,
        })
        .from(transcripts)
        .where(
          and(
            inArray(transcripts.accountId, accountIds),
            gte(transcripts.createdAt, sinceDate),
            lte(transcripts.createdAt, untilDate)
          )
        )
        .groupBy(transcripts.accountId),
      db
        .select({
          accountId: contextDocuments.accountId,
          count: sql<number>`count(*)::int`,
        })
        .from(contextDocuments)
        .where(
          and(
            inArray(contextDocuments.accountId, accountIds),
            gte(contextDocuments.createdAt, sinceDate),
            lte(contextDocuments.createdAt, untilDate)
          )
        )
        .groupBy(contextDocuments.accountId),
    ]);

    opportunitiesCount = new Set(oppRows.map((r) => r.accountId)).size;

    const transcriptsByAccount = new Map(
      transcriptRows.map((r) => [r.accountId, r.count])
    );
    const docsByAccount = new Map(docRows.map((r) => [r.accountId, r.count]));

    topActivity = inScopeAccounts
      .map((a) => {
        const tCount = transcriptsByAccount.get(a.id) ?? 0;
        const dCount = docsByAccount.get(a.id) ?? 0;
        return {
          accountId: a.id,
          accountName: a.name,
          fee: a.fee !== null ? Number(a.fee) : null,
          transcriptsCount: tCount,
          documentsCount: dCount,
          activityCount: tCount + dCount,
        };
      })
      .filter((row) => row.activityCount > 0)
      .sort((a, b) => b.activityCount - a.activityCount)
      .slice(0, 10);
  }

  // Industry + size distributions: snapshot, in-memory aggregation.
  const industryCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  for (const a of inScopeAccounts) {
    const ind = (a.industry ?? "").trim() || "Sin clasificar";
    industryCounts.set(ind, (industryCounts.get(ind) ?? 0) + 1);
    const sz = (a.employeeCount ?? "").trim() || "Sin clasificar";
    sizeCounts.set(sz, (sizeCounts.get(sz) ?? 0) + 1);
  }
  industries = [...industryCounts.entries()]
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count);
  sizes = [...sizeCounts.entries()]
    .map(([employeeCount, count]) => ({ employeeCount, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalAccounts,
    healthDistribution,
    feeTotal,
    ticketAverage,
    durationMonthsAverage,
    ltv,
    accountsWithoutFee,
    opportunitiesCount,
    topActivity,
    industries,
    sizes,
  };
}
