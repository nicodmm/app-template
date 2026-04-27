import { db } from "@/lib/drizzle/db";
import {
  workspaces,
  users,
  accounts,
  transcripts,
  signals,
  llmUsage,
  adminDashboardSnapshot,
  type SnapshotWorkspaceRow,
  type SnapshotLlmTaskRow,
  type AdminDashboardSnapshotRow,
} from "@/lib/drizzle/schema";
import { and, eq, gte, isNull, sql, inArray } from "drizzle-orm";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface ComputedSnapshot {
  workspacesTotal: number;
  workspacesNew30d: number;
  usersTotal: number;
  usersNew30d: number;
  accountsActive: number;
  transcriptsCompleted30d: number;
  llmCostUsd30d: string;
  llmTokensTotal30d: number;
  llmCostUsdLifetime: string;
  llmTokensLifetime: number;
  topWorkspaces: SnapshotWorkspaceRow[];
  llmByTask: SnapshotLlmTaskRow[];
}

/**
 * Runs the heavy aggregate work to populate the dashboard snapshot.
 * Designed to run in a Trigger.dev task far from any user request, so
 * a long execution doesn't pin pooler connections used by `/app/*`
 * pages. The set of queries here mirrors what the old in-render
 * `getAdminDashboardMetrics` did.
 */
export async function computeAdminDashboardSnapshot(): Promise<ComputedSnapshot> {
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
    llmByTaskRows,
    wsRows,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(workspaces),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(workspaces)
      .where(gte(workspaces.createdAt, since)),
    db.select({ n: sql<number>`count(*)::int` }).from(users),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(gte(users.createdAt, since)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(accounts)
      .where(isNull(accounts.closedAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transcripts)
      .where(
        and(
          eq(transcripts.status, "completed"),
          gte(transcripts.createdAt, since)
        )
      ),
    db
      .select({
        cost: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
        tokens: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens} + ${llmUsage.cacheReadTokens} + ${llmUsage.cacheWriteTokens}), 0)::bigint`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, since)),
    db
      .select({
        cost: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
        tokens: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens} + ${llmUsage.cacheReadTokens} + ${llmUsage.cacheWriteTokens}), 0)::bigint`,
      })
      .from(llmUsage),
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
      .groupBy(llmUsage.taskName),
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerName: users.fullName,
        ownerEmail: users.email,
      })
      .from(workspaces)
      .leftJoin(users, eq(users.id, workspaces.ownerId)),
  ]);

  // Per-workspace fanout. wsRows is small (admin platform — usually <100
  // workspaces), so this stays cheap.
  const wsIds = wsRows.map((w) => w.id);

  let accountsByWs = new Map<string, number>();
  let transcriptsByWs = new Map<string, number>();
  let signalsByWs = new Map<string, number>();
  let lastActivityByWs = new Map<string, Date>();

  if (wsIds.length > 0) {
    const [accCounts, trCounts, sigCounts, lastAct] = await Promise.all([
      db
        .select({
          workspaceId: accounts.workspaceId,
          n: sql<number>`count(*)::int`,
        })
        .from(accounts)
        .where(
          and(inArray(accounts.workspaceId, wsIds), isNull(accounts.closedAt))
        )
        .groupBy(accounts.workspaceId),
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
        .groupBy(transcripts.workspaceId),
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
        .groupBy(accounts.workspaceId),
      db
        .select({
          workspaceId: transcripts.workspaceId,
          last: sql<Date | null>`max(${transcripts.createdAt})`,
        })
        .from(transcripts)
        .where(inArray(transcripts.workspaceId, wsIds))
        .groupBy(transcripts.workspaceId),
    ]);

    accountsByWs = new Map(accCounts.map((r) => [r.workspaceId, r.n]));
    transcriptsByWs = new Map(trCounts.map((r) => [r.workspaceId, r.n]));
    signalsByWs = new Map(sigCounts.map((r) => [r.workspaceId, r.n]));
    lastActivityByWs = new Map(
      lastAct
        .filter((r) => r.last !== null)
        .map((r) => [r.workspaceId, r.last as Date])
    );
  }

  const topWorkspaces: SnapshotWorkspaceRow[] = wsRows
    .map((w) => ({
      workspaceId: w.id,
      workspaceName: w.name,
      ownerDisplay: w.ownerName ?? w.ownerEmail ?? null,
      accountsActive: accountsByWs.get(w.id) ?? 0,
      transcripts30d: transcriptsByWs.get(w.id) ?? 0,
      signalsActive: signalsByWs.get(w.id) ?? 0,
      lastActivityAt: (lastActivityByWs.get(w.id) ?? null)?.toISOString() ?? null,
    }))
    .sort((a, b) => {
      if (b.transcripts30d !== a.transcripts30d)
        return b.transcripts30d - a.transcripts30d;
      if (b.accountsActive !== a.accountsActive)
        return b.accountsActive - a.accountsActive;
      return 0;
    })
    .slice(0, 10);

  const llmByTask: SnapshotLlmTaskRow[] = llmByTaskRows
    .map((r) => ({
      taskName: r.taskName,
      calls: r.calls,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      costUsd: Number(r.costUsd ?? 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    workspacesTotal: workspacesTotalRow[0]?.n ?? 0,
    workspacesNew30d: workspacesNewRow[0]?.n ?? 0,
    usersTotal: usersTotalRow[0]?.n ?? 0,
    usersNew30d: usersNewRow[0]?.n ?? 0,
    accountsActive: accountsActiveRow[0]?.n ?? 0,
    transcriptsCompleted30d: transcriptsRow[0]?.n ?? 0,
    llmCostUsd30d: String(llmAgg30dRow[0]?.cost ?? "0"),
    llmTokensTotal30d: Number(llmAgg30dRow[0]?.tokens ?? 0),
    llmCostUsdLifetime: String(llmAggLifetimeRow[0]?.cost ?? "0"),
    llmTokensLifetime: Number(llmAggLifetimeRow[0]?.tokens ?? 0),
    topWorkspaces,
    llmByTask,
  };
}

/**
 * Persist a freshly-computed snapshot via upsert against the singleton
 * `kind = 'global'` row. Idempotent — safe to call from any task.
 */
export async function persistAdminDashboardSnapshot(
  data: ComputedSnapshot
): Promise<void> {
  await db
    .insert(adminDashboardSnapshot)
    .values({
      kind: "global",
      workspacesTotal: data.workspacesTotal,
      workspacesNew30d: data.workspacesNew30d,
      usersTotal: data.usersTotal,
      usersNew30d: data.usersNew30d,
      accountsActive: data.accountsActive,
      transcriptsCompleted30d: data.transcriptsCompleted30d,
      llmCostUsd30d: data.llmCostUsd30d,
      llmTokensTotal30d: data.llmTokensTotal30d,
      llmCostUsdLifetime: data.llmCostUsdLifetime,
      llmTokensLifetime: data.llmTokensLifetime,
      topWorkspaces: data.topWorkspaces,
      llmByTask: data.llmByTask,
      refreshedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: adminDashboardSnapshot.kind,
      set: {
        workspacesTotal: data.workspacesTotal,
        workspacesNew30d: data.workspacesNew30d,
        usersTotal: data.usersTotal,
        usersNew30d: data.usersNew30d,
        accountsActive: data.accountsActive,
        transcriptsCompleted30d: data.transcriptsCompleted30d,
        llmCostUsd30d: data.llmCostUsd30d,
        llmTokensTotal30d: data.llmTokensTotal30d,
        llmCostUsdLifetime: data.llmCostUsdLifetime,
        llmTokensLifetime: data.llmTokensLifetime,
        topWorkspaces: data.topWorkspaces,
        llmByTask: data.llmByTask,
        refreshedAt: new Date(),
      },
    });
}

/**
 * Single-query read for the admin page. Returns null when the snapshot
 * has never been computed yet (fresh deploy, cron hasn't run).
 */
export async function readAdminDashboardSnapshot(): Promise<AdminDashboardSnapshotRow | null> {
  const rows = await db
    .select()
    .from(adminDashboardSnapshot)
    .where(eq(adminDashboardSnapshot.kind, "global"))
    .limit(1);
  return rows[0] ?? null;
}
