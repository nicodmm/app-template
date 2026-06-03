import { db } from "@/lib/drizzle/db";
import {
  accountFinance,
  financeEngagements,
  financeEngagementPeriods,
  financeFeeShares,
  workspaceMembers,
  users,
} from "@/lib/drizzle/schema";
import { asc, eq, inArray } from "drizzle-orm";

export interface AccountTerms {
  termsRawText: string | null;
  termsStatus: string;
  termsError: string | null;
  engagements: Array<{
    id: string;
    neurona: string;
    currency: string;
    billingRule: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    source: string;
    periods: Array<{
      id: string;
      fromDate: string;
      toDate: string | null;
      fee: number;
      currency: string;
      source: string;
    }>;
    shares: Array<{
      id: string;
      memberId: string | null;
      consultantNameRaw: string | null;
      shareType: string;
      shareValue: number;
      shareCurrency: string | null;
      source: string;
    }>;
  }>;
}

export async function getAccountTerms(accountId: string): Promise<AccountTerms> {
  const [meta] = await db
    .select({
      termsRawText: accountFinance.termsRawText,
      termsStatus: accountFinance.termsStatus,
      termsError: accountFinance.termsError,
    })
    .from(accountFinance)
    .where(eq(accountFinance.accountId, accountId))
    .limit(1);

  const engagementRows = await db
    .select()
    .from(financeEngagements)
    .where(eq(financeEngagements.accountId, accountId))
    .orderBy(asc(financeEngagements.sortOrder), asc(financeEngagements.createdAt));

  const engagementIds = engagementRows.map((e) => e.id);

  const periodRows = engagementIds.length
    ? await db
        .select()
        .from(financeEngagementPeriods)
        .where(inArray(financeEngagementPeriods.engagementId, engagementIds))
        .orderBy(asc(financeEngagementPeriods.fromDate))
    : [];

  const shareRows = engagementIds.length
    ? await db
        .select()
        .from(financeFeeShares)
        .where(inArray(financeFeeShares.engagementId, engagementIds))
        .orderBy(asc(financeFeeShares.createdAt))
    : [];

  const engagements = engagementRows.map((e) => ({
    id: e.id,
    neurona: e.neurona,
    currency: e.currency,
    billingRule: e.billingRule,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
    source: e.source,
    periods: periodRows
      .filter((p) => p.engagementId === e.id)
      .map((p) => ({
        id: p.id,
        fromDate: p.fromDate,
        toDate: p.toDate,
        fee: Number(p.fee),
        currency: p.currency,
        source: p.source,
      })),
    shares: shareRows
      .filter((s) => s.engagementId === e.id)
      .map((s) => ({
        id: s.id,
        memberId: s.memberId,
        consultantNameRaw: s.consultantNameRaw,
        shareType: s.shareType,
        shareValue: Number(s.shareValue),
        shareCurrency: s.shareCurrency,
        source: s.source,
      })),
  }));

  return {
    termsRawText: meta?.termsRawText ?? null,
    termsStatus: meta?.termsStatus ?? "none",
    termsError: meta?.termsError ?? null,
    engagements,
  };
}

export interface FinanceMember {
  memberId: string;
  name: string;
}

/**
 * Workspace members keyed by the `workspace_members.id` PK (which is what
 * `finance_fee_shares.member_id` references), with a display name.
 */
export async function getFinanceMembers(
  workspaceId: string
): Promise<FinanceMember[]> {
  const rows = await db
    .select({
      memberId: workspaceMembers.id,
      fullName: users.fullName,
      email: users.email,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return rows.map((r) => ({
    memberId: r.memberId,
    name: r.fullName ?? r.email,
  }));
}
