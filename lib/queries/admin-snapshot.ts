import { db } from "@/lib/drizzle/db";
import {
  workspaces,
  workspaceMembers,
  users,
  accounts,
  transcripts,
  signals,
  llmUsage,
  adminDashboardSnapshot,
  type SnapshotWorkspaceRow,
  type SnapshotLlmTaskRow,
  type SnapshotUserRow,
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
  topUsers: SnapshotUserRow[];
}

/**
 * Runs the heavy aggregate work to populate the dashboard snapshot.
 * Designed to run in a Trigger.dev task far from any user request, so
 * a long execution doesn't pin pooler connections used by `/app/*`
 * pages. Queries run sequentially with per-step timing logs so a slow
 * query is visible in the Trigger trace instead of disappearing into
 * a Promise.all that times out as a whole.
 */
export async function computeAdminDashboardSnapshot(): Promise<ComputedSnapshot> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      const out = await fn();
      console.log(`[admin-snapshot] ${label} ok in ${Date.now() - t0}ms`);
      return out;
    } catch (err) {
      console.error(
        `[admin-snapshot] ${label} FAILED after ${Date.now() - t0}ms`,
        err
      );
      throw err;
    }
  }

  const workspacesTotalRow = await step("workspaces.total", () =>
    db.select({ n: sql<number>`count(*)::int` }).from(workspaces)
  );
  const workspacesNewRow = await step("workspaces.new30d", () =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(workspaces)
      .where(gte(workspaces.createdAt, since))
  );
  const usersTotalRow = await step("users.total", () =>
    db.select({ n: sql<number>`count(*)::int` }).from(users)
  );
  const usersNewRow = await step("users.new30d", () =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(gte(users.createdAt, since))
  );
  const accountsActiveRow = await step("accounts.active", () =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(accounts)
      .where(isNull(accounts.closedAt))
  );
  const transcriptsRow = await step("transcripts.completed30d", () =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transcripts)
      .where(
        and(
          eq(transcripts.status, "completed"),
          gte(transcripts.createdAt, since)
        )
      )
  );
  const llmAgg30dRow = await step("llm.agg30d", () =>
    db
      .select({
        cost: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
        tokens: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens} + ${llmUsage.cacheReadTokens} + ${llmUsage.cacheWriteTokens}), 0)::bigint`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, since))
  );
  const llmAggLifetimeRow = await step("llm.aggLifetime", () =>
    db
      .select({
        cost: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)::text`,
        tokens: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens} + ${llmUsage.cacheReadTokens} + ${llmUsage.cacheWriteTokens}), 0)::bigint`,
      })
      .from(llmUsage)
  );
  const llmByTaskRows = await step("llm.byTask30d", () =>
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
  const wsRows = await step("workspaces.withOwners", () =>
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerName: users.fullName,
        ownerEmail: users.email,
      })
      .from(workspaces)
      .leftJoin(users, eq(users.id, workspaces.ownerId))
  );

  const wsIds = wsRows.map((w) => w.id);

  let accountsByWs = new Map<string, number>();
  let transcriptsByWs = new Map<string, number>();
  let signalsByWs = new Map<string, number>();
  let lastActivityByWs = new Map<string, Date>();

  if (wsIds.length > 0) {
    const accCounts = await step("accounts.byWs", () =>
      db
        .select({
          workspaceId: accounts.workspaceId,
          n: sql<number>`count(*)::int`,
        })
        .from(accounts)
        .where(
          and(inArray(accounts.workspaceId, wsIds), isNull(accounts.closedAt))
        )
        .groupBy(accounts.workspaceId)
    );
    const trCounts = await step("transcripts.byWs30d", () =>
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
    );
    const sigCounts = await step("signals.activeByWs", () =>
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
    );
    const lastAct = await step("transcripts.lastActivityByWs", () =>
      db
        .select({
          workspaceId: transcripts.workspaceId,
          last: sql<unknown>`max(${transcripts.createdAt})`,
        })
        .from(transcripts)
        .where(inArray(transcripts.workspaceId, wsIds))
        .groupBy(transcripts.workspaceId)
    );

    accountsByWs = new Map(accCounts.map((r) => [r.workspaceId, r.n]));
    transcriptsByWs = new Map(trCounts.map((r) => [r.workspaceId, r.n]));
    signalsByWs = new Map(sigCounts.map((r) => [r.workspaceId, r.n]));
    // postgres-js returns timestamps as Date in some configs and as raw
    // strings in others; normalize to Date so the downstream toISOString
    // call works regardless.
    lastActivityByWs = new Map(
      lastAct
        .filter((r) => r.last !== null && r.last !== undefined)
        .map((r) => {
          const v = r.last;
          const d = v instanceof Date ? v : new Date(v as string);
          return [r.workspaceId, d] as [string, Date];
        })
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

  // Users — full list with per-user aggregates. Same pattern as workspaces:
  // small admin platform, so a fanout of 3 extra queries is cheap.
  const userRows = await step("users.list", () =>
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
  );

  let workspacesByUser = new Map<string, number>();
  let transcriptsByUser = new Map<string, number>();
  let lastActivityByUser = new Map<string, Date>();

  if (userRows.length > 0) {
    const userIds = userRows.map((u) => u.id);
    const wmCounts = await step("workspaceMembers.byUser", () =>
      db
        .select({
          userId: workspaceMembers.userId,
          n: sql<number>`count(distinct ${workspaceMembers.workspaceId})::int`,
        })
        .from(workspaceMembers)
        .where(inArray(workspaceMembers.userId, userIds))
        .groupBy(workspaceMembers.userId)
    );
    const trByUser = await step("transcripts.byUser30d", () =>
      db
        .select({
          uploadedBy: transcripts.uploadedBy,
          n: sql<number>`count(*)::int`,
        })
        .from(transcripts)
        .where(
          and(
            inArray(transcripts.uploadedBy, userIds),
            gte(transcripts.createdAt, since)
          )
        )
        .groupBy(transcripts.uploadedBy)
    );
    const lastByUser = await step("transcripts.lastActivityByUser", () =>
      db
        .select({
          uploadedBy: transcripts.uploadedBy,
          last: sql<unknown>`max(${transcripts.createdAt})`,
        })
        .from(transcripts)
        .where(inArray(transcripts.uploadedBy, userIds))
        .groupBy(transcripts.uploadedBy)
    );

    workspacesByUser = new Map(wmCounts.map((r) => [r.userId, r.n]));
    transcriptsByUser = new Map(
      trByUser
        .filter((r) => r.uploadedBy !== null)
        .map((r) => [r.uploadedBy as string, r.n])
    );
    lastActivityByUser = new Map(
      lastByUser
        .filter(
          (r) =>
            r.uploadedBy !== null && r.last !== null && r.last !== undefined
        )
        .map((r) => {
          const v = r.last;
          const d = v instanceof Date ? v : new Date(v as string);
          return [r.uploadedBy as string, d] as [string, Date];
        })
    );
  }

  const topUsers: SnapshotUserRow[] = userRows
    .map((u) => ({
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      workspacesCount: workspacesByUser.get(u.id) ?? 0,
      transcripts30d: transcriptsByUser.get(u.id) ?? 0,
      lastActivityAt:
        (lastActivityByUser.get(u.id) ?? null)?.toISOString() ?? null,
      createdAt:
        u.createdAt instanceof Date
          ? u.createdAt.toISOString()
          : new Date(u.createdAt as unknown as string).toISOString(),
    }))
    .sort((a, b) => {
      if (b.transcripts30d !== a.transcripts30d)
        return b.transcripts30d - a.transcripts30d;
      const aLast = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bLast = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      if (bLast !== aLast) return bLast - aLast;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

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
    topUsers,
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
      topUsers: data.topUsers,
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
        topUsers: data.topUsers,
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
