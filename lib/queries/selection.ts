import { db } from "@/lib/drizzle/db";
import {
  selectionSearches,
  selectionCandidates,
} from "@/lib/drizzle/schema";
import { and, eq, desc, sql } from "drizzle-orm";

export interface SelectionKpis {
  activeSearches: number;
  totalCandidates: number;
  pendingFeedback: number;
}

export async function getSelectionKpis(accountId: string): Promise<SelectionKpis> {
  const [searchRow] = await db
    .select({
      active: sql<number>`count(*) filter (where ${selectionSearches.status} = 'active')`,
    })
    .from(selectionSearches)
    .where(eq(selectionSearches.accountId, accountId));

  const [candRow] = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`count(*) filter (where ${selectionCandidates.status} = 'pending')`,
    })
    .from(selectionCandidates)
    .where(eq(selectionCandidates.accountId, accountId));

  return {
    activeSearches: Number(searchRow?.active ?? 0),
    totalCandidates: Number(candRow?.total ?? 0),
    pendingFeedback: Number(candRow?.pending ?? 0),
  };
}

export interface SearchWithCounts {
  id: string;
  position: string;
  positionDescription: string | null;
  status: string;
  razonSocial: string | null;
  cuit: string | null;
  createdAt: Date;
  candidateCount: number;
  pendingCount: number;
  confidential: boolean;
}

export async function listSearchesForAccount(
  accountId: string
): Promise<SearchWithCounts[]> {
  const rows = await db
    .select({
      id: selectionSearches.id,
      position: selectionSearches.position,
      positionDescription: selectionSearches.positionDescription,
      status: selectionSearches.status,
      razonSocial: selectionSearches.razonSocial,
      cuit: selectionSearches.cuit,
      createdAt: selectionSearches.createdAt,
      confidential: selectionSearches.confidential,
      candidateCount: sql<number>`count(${selectionCandidates.id})`,
      pendingCount: sql<number>`count(${selectionCandidates.id}) filter (where ${selectionCandidates.status} = 'pending')`,
    })
    .from(selectionSearches)
    .leftJoin(
      selectionCandidates,
      eq(selectionCandidates.searchId, selectionSearches.id)
    )
    .where(eq(selectionSearches.accountId, accountId))
    .groupBy(selectionSearches.id)
    .orderBy(desc(selectionSearches.createdAt));

  return rows.map((r) => ({
    ...r,
    candidateCount: Number(r.candidateCount),
    pendingCount: Number(r.pendingCount),
  }));
}

export async function getSearch(searchId: string, accountId: string) {
  const [row] = await db
    .select()
    .from(selectionSearches)
    .where(
      and(
        eq(selectionSearches.id, searchId),
        eq(selectionSearches.accountId, accountId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function listCandidatesForSearch(searchId: string) {
  return db
    .select()
    .from(selectionCandidates)
    .where(eq(selectionCandidates.searchId, searchId))
    .orderBy(desc(selectionCandidates.createdAt));
}
