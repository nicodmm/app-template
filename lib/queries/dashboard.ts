import { db } from "@/lib/drizzle/db";
import {
  accounts,
  transcripts,
  contextDocuments,
  signals,
  users,
} from "@/lib/drizzle/schema";
import { and, eq, isNull, gte, lte, inArray, sql } from "drizzle-orm";

const HEALTH_BUCKETS = ["green", "yellow", "red", "inactive"] as const;
export type HealthBucket = (typeof HEALTH_BUCKETS)[number];

export interface DashboardScope {
  workspaceId: string;
  userId: string;
  role: string;
  /** Optional service filter — matches accounts whose serviceScope (comma list) contains this label. */
  service?: string | null;
  /** Optional owner filter — restricts to accounts owned by this user (only honored when role allows). */
  ownerId?: string | null;
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
  /** Top 10 accounts by transcripts + context_documents in window, ranked by lifetime monthly average. */
  topActivity: Array<{
    accountId: string;
    accountName: string;
    fee: number | null;
    transcriptsCount: number;
    documentsCount: number;
    activityCount: number;
    /** activityCount divided by months active. null when startDate is missing or account is < 1 month old. */
    activityPerMonth: number | null;
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
  } else if (scope.ownerId) {
    conds.push(eq(accounts.ownerId, scope.ownerId));
  }
  if (scope.service) {
    if (scope.service === "Sin servicio") {
      conds.push(
        sql`(${accounts.serviceScope} IS NULL OR btrim(${accounts.serviceScope}) = '')`
      );
    } else {
      conds.push(
        sql`${accounts.serviceScope} ILIKE ${"%" + scope.service + "%"}`
      );
    }
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
      industryCategory: accounts.industryCategory,
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

    const MS_PER_MONTH_LOCAL = 1000 * 60 * 60 * 24 * (365.25 / 12);
    topActivity = inScopeAccounts
      .map((a) => {
        const tCount = transcriptsByAccount.get(a.id) ?? 0;
        const dCount = docsByAccount.get(a.id) ?? 0;
        const activityCount = tCount + dCount;
        let activityPerMonth: number | null = null;
        if (a.startDate) {
          const start = new Date(a.startDate).getTime();
          const end = a.closedAt
            ? new Date(a.closedAt).getTime()
            : Date.now();
          const months = (end - start) / MS_PER_MONTH_LOCAL;
          if (Number.isFinite(months) && months >= 1) {
            activityPerMonth = activityCount / months;
          }
        }
        return {
          accountId: a.id,
          accountName: a.name,
          fee: a.fee !== null ? Number(a.fee) : null,
          transcriptsCount: tCount,
          documentsCount: dCount,
          activityCount,
          activityPerMonth,
        };
      })
      .filter((row) => row.activityCount > 0)
      .sort((a, b) => {
        if (a.activityPerMonth === null && b.activityPerMonth === null)
          return 0;
        if (a.activityPerMonth === null) return 1;
        if (b.activityPerMonth === null) return -1;
        return b.activityPerMonth - a.activityPerMonth;
      })
      .slice(0, 10);
  }

  // Industry + size distributions: snapshot, in-memory aggregation.
  const industryCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  for (const a of inScopeAccounts) {
    const ind = (a.industryCategory ?? "").trim() || "Sin clasificar";
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

export type DashboardMetricKey =
  | "total_accounts"
  | "fee_total"
  | "ticket_average"
  | "duration_months"
  | "ltv";

export interface DashboardBreakdownRow {
  /** Display label for this group. */
  label: string;
  /** Aggregate value of the metric for accounts in this group. */
  value: number;
  /** How many accounts fall into this group. */
  accountsCount: number;
}

export interface DashboardBreakdown {
  byService: DashboardBreakdownRow[];
  byIndustry: DashboardBreakdownRow[];
  bySize: DashboardBreakdownRow[];
  /** Empty when scope.role === 'member'. */
  byOwner: DashboardBreakdownRow[];
}

interface BreakdownAccount {
  id: string;
  fee: number | null;
  startDate: string | null;
  closedAt: Date | null;
  serviceScope: string | null;
  industry: string | null;
  industryCategory: string | null;
  employeeCount: string | null;
  ownerName: string | null;
}

function aggregateMetric(
  group: BreakdownAccount[],
  metric: DashboardMetricKey
): number {
  const fees = group
    .map((a) => a.fee)
    .filter((n): n is number => n !== null && Number.isFinite(n));
  const MS_PER_MONTH = 1000 * 60 * 60 * 24 * (365.25 / 12);
  const durations: number[] = [];
  for (const a of group) {
    if (!a.startDate) continue;
    const start = new Date(a.startDate).getTime();
    const end = a.closedAt ? new Date(a.closedAt).getTime() : Date.now();
    const months = (end - start) / MS_PER_MONTH;
    if (Number.isFinite(months) && months >= 0) durations.push(months);
  }
  const groupTicket =
    fees.length > 0 ? fees.reduce((a, b) => a + b, 0) / fees.length : null;
  const groupDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

  switch (metric) {
    case "total_accounts":
      return group.length;
    case "fee_total":
      return fees.reduce((a, b) => a + b, 0);
    case "ticket_average":
      return groupTicket ?? 0;
    case "duration_months":
      return groupDuration ?? 0;
    case "ltv":
      return groupTicket !== null && groupDuration !== null
        ? groupTicket * groupDuration
        : 0;
  }
}

function expandServices(serviceScope: string | null): string[] {
  if (!serviceScope) return ["Sin servicio"];
  const items = serviceScope
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : ["Sin servicio"];
}

export async function getDashboardMetricBreakdown(
  scope: DashboardScope,
  _period: DashboardPeriod,
  metric: DashboardMetricKey
): Promise<DashboardBreakdown> {
  const baseConds = scopeConditions(scope);

  const rows = await db
    .select({
      id: accounts.id,
      fee: accounts.fee,
      startDate: accounts.startDate,
      closedAt: accounts.closedAt,
      serviceScope: accounts.serviceScope,
      industry: accounts.industry,
      industryCategory: accounts.industryCategory,
      employeeCount: accounts.employeeCount,
      ownerId: accounts.ownerId,
    })
    .from(accounts)
    .where(and(...baseConds));

  // Resolve owner display names via a single in-memory join.
  const ownerIds = [
    ...new Set(rows.map((r) => r.ownerId).filter(Boolean)),
  ] as string[];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(inArray(users.id, ownerIds));
    for (const u of userRows) {
      ownerNames.set(u.id, u.fullName ?? u.email);
    }
  }

  const accountsTyped: BreakdownAccount[] = rows.map((r) => ({
    id: r.id,
    fee: r.fee !== null ? Number(r.fee) : null,
    startDate: r.startDate,
    closedAt: r.closedAt,
    serviceScope: r.serviceScope,
    industry: r.industry,
    industryCategory: r.industryCategory,
    employeeCount: r.employeeCount,
    ownerName: r.ownerId ? (ownerNames.get(r.ownerId) ?? "Sin nombre") : null,
  }));

  // Service grouping: an account in "Growth, Marketing" counts in BOTH
  // service buckets (so the bars sum to > total accounts, by design — the
  // user wanted "cuántas cuentas tocan cada servicio").
  const byServiceMap = new Map<string, BreakdownAccount[]>();
  for (const a of accountsTyped) {
    for (const svc of expandServices(a.serviceScope)) {
      if (!byServiceMap.has(svc)) byServiceMap.set(svc, []);
      byServiceMap.get(svc)!.push(a);
    }
  }
  const byService = [...byServiceMap.entries()]
    .map(([label, group]) => ({
      label,
      value: aggregateMetric(group, metric),
      accountsCount: group.length,
    }))
    .sort((a, b) => b.value - a.value);

  // Industry / size groupings.
  const groupBy = (key: "industryCategory" | "employeeCount") => {
    const m = new Map<string, BreakdownAccount[]>();
    for (const a of accountsTyped) {
      const label = (a[key] ?? "").trim() || "Sin clasificar";
      if (!m.has(label)) m.set(label, []);
      m.get(label)!.push(a);
    }
    return [...m.entries()]
      .map(([label, group]) => ({
        label,
        value: aggregateMetric(group, metric),
        accountsCount: group.length,
      }))
      .sort((a, b) => b.value - a.value);
  };
  const byIndustry = groupBy("industryCategory");
  const bySize = groupBy("employeeCount");

  // Owner: only shown for owner/admin viewers.
  let byOwner: DashboardBreakdownRow[] = [];
  if (scope.role === "owner" || scope.role === "admin") {
    const m = new Map<string, BreakdownAccount[]>();
    for (const a of accountsTyped) {
      const label = a.ownerName ?? "Sin responsable";
      if (!m.has(label)) m.set(label, []);
      m.get(label)!.push(a);
    }
    byOwner = [...m.entries()]
      .map(([label, group]) => ({
        label,
        value: aggregateMetric(group, metric),
        accountsCount: group.length,
      }))
      .sort((a, b) => b.value - a.value);
  }

  return { byService, byIndustry, bySize, byOwner };
}

export type AccountsListFilter =
  | { type: "health"; bucket: HealthBucket }
  | { type: "opportunities" }
  | { type: "industry"; value: string }
  | { type: "size"; value: string };

export interface AccountsListRow {
  id: string;
  name: string;
  serviceScope: string | null;
  ownerName: string | null;
  healthSignal: HealthBucket | null;
}

export async function getDashboardAccountsList(
  scope: DashboardScope,
  period: DashboardPeriod,
  filter: AccountsListFilter
): Promise<AccountsListRow[]> {
  const baseConds = scopeConditions(scope);

  const conds = [...baseConds];
  if (filter.type === "health") {
    if (filter.bucket === "inactive") {
      conds.push(
        sql`(${accounts.healthSignal} IS NULL OR ${accounts.healthSignal} = 'inactive')`
      );
    } else {
      conds.push(eq(accounts.healthSignal, filter.bucket));
    }
  } else if (filter.type === "industry") {
    if (filter.value === "Sin clasificar") {
      conds.push(
        sql`(${accounts.industryCategory} IS NULL OR btrim(${accounts.industryCategory}) = '')`
      );
    } else {
      conds.push(eq(accounts.industryCategory, filter.value));
    }
  } else if (filter.type === "size") {
    if (filter.value === "Sin clasificar") {
      conds.push(
        sql`(${accounts.employeeCount} IS NULL OR btrim(${accounts.employeeCount}) = '')`
      );
    } else {
      conds.push(eq(accounts.employeeCount, filter.value));
    }
  }

  let rows: Array<{
    id: string;
    name: string;
    serviceScope: string | null;
    healthSignal: string | null;
    ownerId: string | null;
  }>;

  if (filter.type === "opportunities") {
    const sinceDate = new Date(`${period.since}T00:00:00Z`);
    const untilDate = new Date(`${period.until}T23:59:59.999Z`);
    rows = await db
      .selectDistinct({
        id: accounts.id,
        name: accounts.name,
        serviceScope: accounts.serviceScope,
        healthSignal: accounts.healthSignal,
        ownerId: accounts.ownerId,
      })
      .from(accounts)
      .innerJoin(signals, eq(signals.accountId, accounts.id))
      .where(
        and(
          ...baseConds,
          inArray(signals.type, ["upsell_opportunity", "growth_opportunity"]),
          eq(signals.status, "active"),
          gte(signals.createdAt, sinceDate),
          lte(signals.createdAt, untilDate)
        )
      );
  } else {
    rows = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        serviceScope: accounts.serviceScope,
        healthSignal: accounts.healthSignal,
        ownerId: accounts.ownerId,
      })
      .from(accounts)
      .where(and(...conds));
  }

  const ownerIds = [
    ...new Set(rows.map((r) => r.ownerId).filter(Boolean)),
  ] as string[];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(inArray(users.id, ownerIds));
    for (const u of userRows) {
      ownerNames.set(u.id, u.fullName ?? u.email);
    }
  }

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      serviceScope: r.serviceScope,
      ownerName: r.ownerId ? (ownerNames.get(r.ownerId) ?? null) : null,
      healthSignal:
        (r.healthSignal as HealthBucket | null) ??
        (filter.type === "health" && filter.bucket === "inactive"
          ? "inactive"
          : null),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
}
