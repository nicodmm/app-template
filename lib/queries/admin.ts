import { db } from "@/lib/drizzle/db";
import {
  workspaces,
  users,
  accounts,
  transcripts,
  signals,
  workspaceMembers,
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
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardSnapshot> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  // KPIs: simple aggregate queries in parallel.
  const [
    workspacesTotalRow,
    workspacesNewRow,
    usersTotalRow,
    usersNewRow,
    accountsActiveRow,
    transcriptsRow,
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
  ]);

  // Top workspaces: derive in-memory from a small set of focused queries
  // instead of correlated subselects. Cheaper to reason about and avoids
  // edge-case planner issues with deeply nested SELECTs in subscribed
  // pooler setups.
  const wsRows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      ownerId: workspaces.ownerId,
      createdAt: workspaces.createdAt,
      ownerName: users.fullName,
      ownerEmail: users.email,
    })
    .from(workspaces)
    .leftJoin(users, eq(users.id, workspaces.ownerId));

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
          and(
            inArray(accounts.workspaceId, wsIds),
            isNull(accounts.closedAt)
          )
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
    const memberRows = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        fullName: users.fullName,
        email: users.email,
        createdAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(inArray(workspaceMembers.workspaceId, ids))
      .orderBy(workspaceMembers.workspaceId, desc(workspaceMembers.createdAt));
    const fallback = new Map<string, string>();
    for (const r of memberRows) {
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

  return {
    kpis: {
      workspacesTotal: workspacesTotalRow[0]?.n ?? 0,
      workspacesNew30d: workspacesNewRow[0]?.n ?? 0,
      usersTotal: usersTotalRow[0]?.n ?? 0,
      usersNew30d: usersNewRow[0]?.n ?? 0,
      accountsActive: accountsActiveRow[0]?.n ?? 0,
      transcriptsCompleted30d: transcriptsRow[0]?.n ?? 0,
    },
    topWorkspaces,
  };
}
