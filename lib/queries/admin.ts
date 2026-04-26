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

  const [
    workspacesTotalRow,
    workspacesNewRow,
    usersTotalRow,
    usersNewRow,
    accountsActiveRow,
    transcriptsRow,
    workspaceRows,
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
        and(eq(transcripts.status, "completed"), gte(transcripts.createdAt, since))
      ),
    // Per-workspace stats. Single composite query with subselects via SQL
    // expressions; cheaper than N round-trips. Filter to top 10 by
    // transcripts in window so the result set stays bounded.
    db.execute<{
      workspace_id: string;
      workspace_name: string;
      owner_display: string | null;
      accounts_active: number;
      transcripts_30d: number;
      signals_active: number;
      last_activity_at: Date | null;
    }>(sql`
      SELECT
        w.id AS workspace_id,
        w.name AS workspace_name,
        COALESCE(u.full_name, u.email) AS owner_display,
        COALESCE((
          SELECT count(*)::int FROM accounts a
          WHERE a.workspace_id = w.id AND a.closed_at IS NULL
        ), 0) AS accounts_active,
        COALESCE((
          SELECT count(*)::int FROM transcripts t
          WHERE t.workspace_id = w.id
            AND t.status = 'completed'
            AND t.created_at >= ${since}
        ), 0) AS transcripts_30d,
        COALESCE((
          SELECT count(DISTINCT s.id)::int FROM signals s
          INNER JOIN accounts a2 ON a2.id = s.account_id
          WHERE a2.workspace_id = w.id AND s.status = 'active'
        ), 0) AS signals_active,
        (
          SELECT max(t.created_at) FROM transcripts t
          WHERE t.workspace_id = w.id
        ) AS last_activity_at
      FROM workspaces w
      LEFT JOIN users u ON u.id = w.owner_id
      ORDER BY transcripts_30d DESC, accounts_active DESC, w.created_at DESC
      LIMIT 10
    `),
  ]);

  const topWorkspaces: AdminWorkspaceRow[] = (
    workspaceRows as unknown as Array<{
      workspace_id: string;
      workspace_name: string;
      owner_display: string | null;
      accounts_active: number;
      transcripts_30d: number;
      signals_active: number;
      last_activity_at: Date | null;
    }>
  ).map((r) => ({
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
    ownerDisplay: r.owner_display,
    accountsActive: r.accounts_active,
    transcripts30d: r.transcripts_30d,
    signalsActive: r.signals_active,
    lastActivityAt: r.last_activity_at,
  }));

  // For workspaces without a stored owner_id (e.g. old data), fall back to
  // the first member's display in JS.
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
