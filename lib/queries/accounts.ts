import { db } from "@/lib/drizzle/db";
import { accounts, users } from "@/lib/drizzle/schema";
import { eq, and, desc, isNull, isNotNull, sql } from "drizzle-orm";
import type { Account } from "@/lib/drizzle/schema";

export type AccountWithOwner = Account & {
  ownerName: string | null;
  ownerEmail: string | null;
};

export type PortfolioStatus = "active" | "archived" | "all";

export interface PortfolioScope {
  workspaceId: string;
  userId: string;
  role: string;
  /** Filter by archive status. Defaults to 'active' (only non-closed accounts). */
  status?: PortfolioStatus;
}

function canSeeAllAccounts(role: string): boolean {
  return role === "owner" || role === "admin";
}

function scopeBaseConditions(scope: PortfolioScope) {
  const conditions = [eq(accounts.workspaceId, scope.workspaceId)];
  if (!canSeeAllAccounts(scope.role)) {
    conditions.push(eq(accounts.ownerId, scope.userId));
  }
  return conditions;
}

export async function getPortfolioAccounts(
  scope: PortfolioScope
): Promise<AccountWithOwner[]> {
  const status = scope.status ?? "active";
  const conditions = scopeBaseConditions(scope);
  if (status === "active") {
    conditions.push(isNull(accounts.closedAt));
  } else if (status === "archived") {
    conditions.push(isNotNull(accounts.closedAt));
  }

  const rows = await db
    .select({
      account: accounts,
      ownerName: users.fullName,
      ownerEmail: users.email,
    })
    .from(accounts)
    .leftJoin(users, eq(accounts.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(
      sql`CASE
        WHEN ${accounts.healthSignal} = 'red' THEN 1
        WHEN ${accounts.healthSignal} = 'yellow' THEN 2
        WHEN ${accounts.healthSignal} = 'green' THEN 3
        ELSE 4
      END`,
      desc(accounts.lastActivityAt)
    );

  return rows.map((r) => ({
    ...r.account,
    ownerName: r.ownerName,
    ownerEmail: r.ownerEmail,
  }));
}

export async function getPortfolioAccountCounts(
  scope: Omit<PortfolioScope, "status">
): Promise<{ active: number; archived: number }> {
  const baseConds = scopeBaseConditions(scope);
  const [activeRow, archivedRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(accounts)
      .where(and(...baseConds, isNull(accounts.closedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(accounts)
      .where(and(...baseConds, isNotNull(accounts.closedAt))),
  ]);
  return {
    active: activeRow[0]?.n ?? 0,
    archived: archivedRow[0]?.n ?? 0,
  };
}

export async function getAccountById(
  accountId: string,
  workspaceId: string,
  viewer?: { userId: string; role: string }
): Promise<AccountWithOwner | null> {
  const rows = await db
    .select({
      account: accounts,
      ownerName: users.fullName,
      ownerEmail: users.email,
    })
    .from(accounts)
    .leftJoin(users, eq(accounts.ownerId, users.id))
    .where(
      and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspaceId))
    )
    .limit(1);

  if (!rows[0]) return null;

  // Role gating: members can only read accounts they own.
  if (viewer && !canSeeAllAccounts(viewer.role)) {
    if (rows[0].account.ownerId !== viewer.userId) return null;
  }

  return {
    ...rows[0].account,
    ownerName: rows[0].ownerName,
    ownerEmail: rows[0].ownerEmail,
  };
}

export async function getAccountsCount(workspaceId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(accounts)
    .where(eq(accounts.workspaceId, workspaceId));
  return result[0]?.count ?? 0;
}
