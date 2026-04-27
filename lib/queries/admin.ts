import { db } from "@/lib/drizzle/db";
import {
  workspaces,
  users,
  accounts,
  transcripts,
  signals,
  workspaceMembers,
  llmUsage,
} from "@/lib/drizzle/schema";
import { and, eq, gte, isNull, sql, desc, inArray } from "drizzle-orm";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface AdminKpis {
  workspacesTotal: number;
  workspacesNew30d: number;
  usersTotal: number;
  usersNew30d: number;
  accountsActive: number;
  transcriptsCompleted30d: number;
  /** Sum of cost_usd across all llm_usage rows in the last 30 days. */
  llmCostUsd30d: number;
  /** Total tokens (input+output+cache) consumed in the last 30 days. */
  llmTokensTotal30d: number;
  /** Total tokens consumed since installation (lifetime). */
  llmTokensLifetime: number;
  /** Cost USD lifetime — useful first time you flip the switch. */
  llmCostUsdLifetime: number;
}

export interface AdminLlmTaskRow {
  taskName: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AdminWorkspaceRow {
  workspaceId: string;
  workspaceName: string;
  ownerDisplay: string | null;
  accountsActive: number;
  transcripts30d: number;
  signalsActive: number;
  lastActivityAt: Date | null;
}

export interface AdminDashboardSnapshot {
  kpis: AdminKpis;
  topWorkspaces: AdminWorkspaceRow[];
  /** Per-task breakdown of LLM spend in the last 30 days. */
  llmByTask30d: AdminLlmTaskRow[];
}

/**
 * Light-weight query: just the 6 KPIs + LLM aggregates. Used by the
 * top KPI tiles. Keeps everything in 8 parallel small aggregates.
 */
export async function getAdminKpis(): Promise<AdminKpis> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const [
    workspacesTotalRow,
    workspacesNewRow,
    usersTotalRow,
    usersNewRow,
    accountsActiveRow,
    transcriptsRow,
    llmAgg30dRow,
    llmAggLifetimeRow,
  ] = await Promise.all([
    safeQuery(
      "workspacesTotal",
      db.select({ n: sql<number>`count(*)::int` }).from(workspaces)
    ),
    safeQuery(
      "workspacesNew",
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(workspaces)
        .where(gte(workspaces.createdAt, since))
    ),
    safeQuery(
      "usersTotal",
      db.select({ n: sql<number>`count(*)::int` }).from(users)
    ),
    safeQuery(
      "usersNew",
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(gte(users.createdAt, since))
    ),
    safeQuery(
      "accountsActive",
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(accounts)
        .where(isNull(accounts.closedAt))
    ),
    safeQuery(
      "transcripts30d",
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(transcripts)
        .where(
          and(
            eq(transcripts.status, "completed"),
            gte(transcripts.createdAt, since)
          )
        )
    ),
    safeQuery(
      "llmAgg30d",
      db
        .select({
          cost: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
          tokens: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens} + ${llmUsage.cacheReadTokens} + ${llmUsage.cacheWriteTokens}), 0)::bigint`,
        })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, since))
    ),
    safeQuery(
      "llmAggLifetime",
      db
        .select({
          cost: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
          tokens: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens} + ${llmUsage.cacheReadTokens} + ${llmUsage.cacheWriteTokens}), 0)::bigint`,
        })
        .from(llmUsage)
    ),
  ]);

  return {
    workspacesTotal: workspacesTotalRow?.[0]?.n ?? 0,
    workspacesNew30d: workspacesNewRow?.[0]?.n ?? 0,
    usersTotal: usersTotalRow?.[0]?.n ?? 0,
    usersNew30d: usersNewRow?.[0]?.n ?? 0,
    accountsActive: accountsActiveRow?.[0]?.n ?? 0,
    transcriptsCompleted30d: transcriptsRow?.[0]?.n ?? 0,
    llmCostUsd30d: Number(llmAgg30dRow?.[0]?.cost ?? 0),
    llmTokensTotal30d: Number(llmAgg30dRow?.[0]?.tokens ?? 0),
    llmCostUsdLifetime: Number(llmAggLifetimeRow?.[0]?.cost ?? 0),
    llmTokensLifetime: Number(llmAggLifetimeRow?.[0]?.tokens ?? 0),
  };
}

/**
 * Per-task LLM cost rollup. Independent from the KPIs so it can stream
 * in its own Suspense boundary.
 */
export async function getAdminLlmByTask(): Promise<AdminLlmTaskRow[]> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const rows = await safeQuery(
    "llmByTask",
    db
      .select({
        taskName: llmUsage.taskName,
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${llmUsage.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${llmUsage.outputTokens}), 0)::bigint`,
        costUsd: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, since))
      .groupBy(llmUsage.taskName)
  );
  return (rows ?? [])
    .map((r) => ({
      taskName: r.taskName,
      calls: r.calls,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      costUsd: Number(r.costUsd ?? 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

/**
 * Top workspaces by activity. The heaviest section — does its own
 * fanned-out queries and is meant to live behind its own Suspense
 * boundary so it can never block the KPI tiles above.
 */
export async function getAdminTopWorkspaces(): Promise<AdminWorkspaceRow[]> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const wsRows = await safeQuery(
    "workspacesList",
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerId: workspaces.ownerId,
        createdAt: workspaces.createdAt,
        ownerName: users.fullName,
        ownerEmail: users.email,
      })
      .from(workspaces)
      .leftJoin(users, eq(users.id, workspaces.ownerId))
  );
  const ws = wsRows ?? [];
  if (ws.length === 0) return [];

  const wsIds = ws.map((w) => w.id);

  const [accCounts, trCounts, sigCounts, lastAct] = await Promise.all([
    safeQuery(
      "accountsByWs",
      db
        .select({
          workspaceId: accounts.workspaceId,
          n: sql<number>`count(*)::int`,
        })
        .from(accounts)
        .where(
          and(
            inArray(accounts.workspaceId, wsIds),
            isNull(accounts.closedAt)
          )
        )
        .groupBy(accounts.workspaceId)
    ),
    safeQuery(
      "transcriptsByWs",
      db
        .select({
          workspaceId: transcripts.workspaceId,
          n: sql<number>`count(*)::int`,
        })
        .from(transcripts)
        .where(
          and(
            inArray(transcripts.workspaceId, wsIds),
            eq(transcripts.status, "completed"),
            gte(transcripts.createdAt, since)
          )
        )
        .groupBy(transcripts.workspaceId)
    ),
    safeQuery(
      "signalsByWs",
      db
        .select({
          workspaceId: accounts.workspaceId,
          n: sql<number>`count(distinct ${signals.id})::int`,
        })
        .from(signals)
        .innerJoin(accounts, eq(accounts.id, signals.accountId))
        .where(
          and(
            inArray(accounts.workspaceId, wsIds),
            eq(signals.status, "active")
          )
        )
        .groupBy(accounts.workspaceId)
    ),
    safeQuery(
      "lastActivityByWs",
      db
        .select({
          workspaceId: transcripts.workspaceId,
          last: sql<Date | null>`max(${transcripts.createdAt})`,
        })
        .from(transcripts)
        .where(inArray(transcripts.workspaceId, wsIds))
        .groupBy(transcripts.workspaceId)
    ),
  ]);

  const accountsByWs = new Map(
    (accCounts ?? []).map((r) => [r.workspaceId, r.n])
  );
  const transcriptsByWs = new Map(
    (trCounts ?? []).map((r) => [r.workspaceId, r.n])
  );
  const signalsByWs = new Map(
    (sigCounts ?? []).map((r) => [r.workspaceId, r.n])
  );
  const lastActivityByWs = new Map(
    (lastAct ?? [])
      .filter((r) => r.last !== null)
      .map((r) => [r.workspaceId, r.last as Date])
  );

  return ws
    .map((w) => ({
      workspaceId: w.id,
      workspaceName: w.name,
      ownerDisplay: w.ownerName ?? w.ownerEmail ?? null,
      accountsActive: accountsByWs.get(w.id) ?? 0,
      transcripts30d: transcriptsByWs.get(w.id) ?? 0,
      signalsActive: signalsByWs.get(w.id) ?? 0,
      lastActivityAt: lastActivityByWs.get(w.id) ?? null,
    }))
    .sort((a, b) => {
      if (b.transcripts30d !== a.transcripts30d)
        return b.transcripts30d - a.transcripts30d;
      if (b.accountsActive !== a.accountsActive)
        return b.accountsActive - a.accountsActive;
      return 0;
    })
    .slice(0, 10);
}

/**
 * Wraps a query in a hard timeout. Returns null when the timeout fires or
 * the query throws — letting the dashboard render partial data instead of
 * hanging forever when one stat is misbehaving (e.g. a Supabase pooler
 * hiccup or the llm_usage table not yet existing on a fresh deploy).
 */
async function safeQuery<T>(
  label: string,
  q: Promise<T>,
  timeoutMs = 5000
): Promise<T | null> {
  return Promise.race([
    q,
    new Promise<null>((resolve) =>
      setTimeout(() => {
        console.error(`[admin] ${label} timed out after ${timeoutMs}ms`);
        resolve(null);
      }, timeoutMs)
    ),
  ]).catch((err) => {
    console.error(`[admin] ${label} failed`, err);
    return null;
  });
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardSnapshot> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  // KPIs and LLM aggregates in parallel, each guarded by safeQuery so a
  // single misbehaving query doesn't take the whole page down.
  const [
    workspacesTotalRow,
    workspacesNewRow,
    usersTotalRow,
    usersNewRow,
    accountsActiveRow,
    transcriptsRow,
    llmAgg30dRow,
    llmAggLifetimeRow,
    llmByTaskRows,
  ] = await Promise.all([
    safeQuery(
      "workspacesTotal",
      db.select({ n: sql<number>`count(*)::int` }).from(workspaces)
    ),
    safeQuery(
      "workspacesNew",
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(workspaces)
        .where(gte(workspaces.createdAt, since))
    ),
    safeQuery(
      "usersTotal",
      db.select({ n: sql<number>`count(*)::int` }).from(users)
    ),
    safeQuery(
      "usersNew",
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(gte(users.createdAt, since))
    ),
    safeQuery(
      "accountsActive",
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(accounts)
        .where(isNull(accounts.closedAt))
    ),
    safeQuery(
      "transcripts30d",
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(transcripts)
        .where(
          and(
            eq(transcripts.status, "completed"),
            gte(transcripts.createdAt, since)
          )
        )
    ),
    safeQuery(
      "llmAgg30d",
      db
        .select({
          cost: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
          tokens: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens} + ${llmUsage.cacheReadTokens} + ${llmUsage.cacheWriteTokens}), 0)::bigint`,
        })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, since))
    ),
    safeQuery(
      "llmAggLifetime",
      db
        .select({
          cost: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
          tokens: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens} + ${llmUsage.cacheReadTokens} + ${llmUsage.cacheWriteTokens}), 0)::bigint`,
        })
        .from(llmUsage)
    ),
    safeQuery(
      "llmByTask",
      db
        .select({
          taskName: llmUsage.taskName,
          calls: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${llmUsage.inputTokens}), 0)::bigint`,
          outputTokens: sql<number>`coalesce(sum(${llmUsage.outputTokens}), 0)::bigint`,
          costUsd: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
        })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, since))
        .groupBy(llmUsage.taskName)
    ),
  ]);

  // Top workspaces: derive in-memory from a small set of focused queries.
  // safeQuery wrapping so this doesn't hang the page on a slow query.
  const wsRowsResult = await safeQuery(
    "workspacesList",
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerId: workspaces.ownerId,
        createdAt: workspaces.createdAt,
        ownerName: users.fullName,
        ownerEmail: users.email,
      })
      .from(workspaces)
      .leftJoin(users, eq(users.id, workspaces.ownerId))
  );
  const wsRows = wsRowsResult ?? [];

  const wsIds = wsRows.map((w) => w.id);

  let accountsByWs = new Map<string, number>();
  let transcriptsByWs = new Map<string, number>();
  let signalsByWs = new Map<string, number>();
  let lastActivityByWs = new Map<string, Date>();

  if (wsIds.length > 0) {
    const [accCounts, trCounts, sigCounts, lastAct] = await Promise.all([
      safeQuery(
        "accountsByWs",
        db
          .select({
            workspaceId: accounts.workspaceId,
            n: sql<number>`count(*)::int`,
          })
          .from(accounts)
          .where(
            and(
              inArray(accounts.workspaceId, wsIds),
              isNull(accounts.closedAt)
            )
          )
          .groupBy(accounts.workspaceId)
      ),
      safeQuery(
        "transcriptsByWs",
        db
          .select({
            workspaceId: transcripts.workspaceId,
            n: sql<number>`count(*)::int`,
          })
          .from(transcripts)
          .where(
            and(
              inArray(transcripts.workspaceId, wsIds),
              eq(transcripts.status, "completed"),
              gte(transcripts.createdAt, since)
            )
          )
          .groupBy(transcripts.workspaceId)
      ),
      safeQuery(
        "signalsByWs",
        db
          .select({
            workspaceId: accounts.workspaceId,
            n: sql<number>`count(distinct ${signals.id})::int`,
          })
          .from(signals)
          .innerJoin(accounts, eq(accounts.id, signals.accountId))
          .where(
            and(
              inArray(accounts.workspaceId, wsIds),
              eq(signals.status, "active")
            )
          )
          .groupBy(accounts.workspaceId)
      ),
      safeQuery(
        "lastActivityByWs",
        db
          .select({
            workspaceId: transcripts.workspaceId,
            last: sql<Date | null>`max(${transcripts.createdAt})`,
          })
          .from(transcripts)
          .where(inArray(transcripts.workspaceId, wsIds))
          .groupBy(transcripts.workspaceId)
      ),
    ]);

    accountsByWs = new Map(
      (accCounts ?? []).map((r) => [r.workspaceId, r.n])
    );
    transcriptsByWs = new Map(
      (trCounts ?? []).map((r) => [r.workspaceId, r.n])
    );
    signalsByWs = new Map(
      (sigCounts ?? []).map((r) => [r.workspaceId, r.n])
    );
    lastActivityByWs = new Map(
      (lastAct ?? [])
        .filter((r) => r.last !== null)
        .map((r) => [r.workspaceId, r.last as Date])
    );
  }

  const topWorkspaces: AdminWorkspaceRow[] = wsRows
    .map((w) => ({
      workspaceId: w.id,
      workspaceName: w.name,
      ownerDisplay: w.ownerName ?? w.ownerEmail ?? null,
      accountsActive: accountsByWs.get(w.id) ?? 0,
      transcripts30d: transcriptsByWs.get(w.id) ?? 0,
      signalsActive: signalsByWs.get(w.id) ?? 0,
      lastActivityAt: lastActivityByWs.get(w.id) ?? null,
    }))
    .sort((a, b) => {
      if (b.transcripts30d !== a.transcripts30d)
        return b.transcripts30d - a.transcripts30d;
      if (b.accountsActive !== a.accountsActive)
        return b.accountsActive - a.accountsActive;
      return 0;
    })
    .slice(0, 10);

  // For workspaces without a stored owner_id, fall back to the first
  // workspace member's display name.
  const fallbackTargets = topWorkspaces.filter((r) => !r.ownerDisplay);
  if (fallbackTargets.length > 0) {
    const ids = fallbackTargets.map((r) => r.workspaceId);
    const memberRows = await safeQuery(
      "ownerFallback",
      db
        .select({
          workspaceId: workspaceMembers.workspaceId,
          fullName: users.fullName,
          email: users.email,
          createdAt: workspaceMembers.createdAt,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(inArray(workspaceMembers.workspaceId, ids))
        .orderBy(workspaceMembers.workspaceId, desc(workspaceMembers.createdAt))
    );
    const fallback = new Map<string, string>();
    for (const r of memberRows ?? []) {
      if (!fallback.has(r.workspaceId)) {
        fallback.set(r.workspaceId, r.fullName ?? r.email);
      }
    }
    for (const row of topWorkspaces) {
      if (!row.ownerDisplay) {
        row.ownerDisplay = fallback.get(row.workspaceId) ?? null;
      }
    }
  }

  const llmByTask30d: AdminLlmTaskRow[] = (llmByTaskRows ?? [])
    .map((r) => ({
      taskName: r.taskName,
      calls: r.calls,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      costUsd: Number(r.costUsd ?? 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    kpis: {
      workspacesTotal: workspacesTotalRow?.[0]?.n ?? 0,
      workspacesNew30d: workspacesNewRow?.[0]?.n ?? 0,
      usersTotal: usersTotalRow?.[0]?.n ?? 0,
      usersNew30d: usersNewRow?.[0]?.n ?? 0,
      accountsActive: accountsActiveRow?.[0]?.n ?? 0,
      transcriptsCompleted30d: transcriptsRow?.[0]?.n ?? 0,
      llmCostUsd30d: Number(llmAgg30dRow?.[0]?.cost ?? 0),
      llmTokensTotal30d: Number(llmAgg30dRow?.[0]?.tokens ?? 0),
      llmCostUsdLifetime: Number(llmAggLifetimeRow?.[0]?.cost ?? 0),
      llmTokensLifetime: Number(llmAggLifetimeRow?.[0]?.tokens ?? 0),
    },
    topWorkspaces,
    llmByTask30d,
  };
}
