import { db } from "@/lib/drizzle/db";
import { accounts, users } from "@/lib/drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { Account } from "@/lib/drizzle/schema";

export type AccountWithOwner = Account & {
  ownerName: string | null;
  ownerEmail: string | null;
};

export async function getPortfolioAccounts(
  workspaceId: string
): Promise<AccountWithOwner[]> {
  const rows = await db
    .select({
      account: accounts,
      ownerName: users.fullName,
      ownerEmail: users.email,
    })
    .from(accounts)
    .leftJoin(users, eq(accounts.ownerId, users.id))
    .where(eq(accounts.workspaceId, workspaceId))
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

export async function getAccountById(
  accountId: string,
  workspaceId: string
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
