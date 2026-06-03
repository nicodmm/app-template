"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accounts,
  accountFinance,
  financeEngagements,
  financeEngagementPeriods,
  financeFeeShares,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";

type R = { success: boolean; error?: string; id?: string };

function rethrowIfRedirect(e: unknown): void {
  if (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    ((e as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (e as { digest: string }).digest === "NEXT_NOT_FOUND")
  )
    throw e;
}

/** Require finance-admin AND the account in the caller's workspace. Returns workspaceId. */
async function requireFinanceAccount(accountId: string): Promise<string> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("No workspace");
  const member = await getWorkspaceMember(workspace.id, userId);
  const allowed =
    !!member &&
    (member.financeAdmin === true ||
      member.role === "owner" ||
      member.role === "admin");
  if (!allowed) throw new Error("Sin permiso de finanzas");
  const [acct] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (!acct) throw new Error("Cuenta no encontrada");
  return workspace.id;
}

async function ensureAccountFinance(
  accountId: string,
  workspaceId: string
): Promise<string> {
  const [existing] = await db
    .select({ id: accountFinance.id })
    .from(accountFinance)
    .where(eq(accountFinance.accountId, accountId))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(accountFinance)
    .values({ accountId, workspaceId })
    .returning({ id: accountFinance.id });
  return row.id;
}

// ---------------------------------------------------------------------------
// 1. saveTermsRawText
// ---------------------------------------------------------------------------
export async function saveTermsRawText(input: {
  accountId: string;
  rawText: string;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    await ensureAccountFinance(input.accountId, workspaceId);
    await db
      .update(accountFinance)
      .set({ termsRawText: input.rawText, updatedAt: new Date() })
      .where(eq(accountFinance.accountId, input.accountId));
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 2. structureTerms
// ---------------------------------------------------------------------------
export async function structureTerms(input: {
  accountId: string;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    await ensureAccountFinance(input.accountId, workspaceId);
    await db
      .update(accountFinance)
      .set({ termsStatus: "structuring", termsError: null, updatedAt: new Date() })
      .where(eq(accountFinance.accountId, input.accountId));
    try {
      const { tasks } = await import("@trigger.dev/sdk/v3");
      await tasks.trigger("structure-finance-terms", {
        accountId: input.accountId,
        workspaceId,
      });
    } catch (err) {
      console.error("Failed to enqueue structure-finance-terms", err);
      await db
        .update(accountFinance)
        .set({ termsStatus: "error", termsError: "No se pudo encolar", updatedAt: new Date() })
        .where(eq(accountFinance.accountId, input.accountId));
      return { success: false, error: "No se pudo encolar" };
    }
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 3. createEngagement
// ---------------------------------------------------------------------------
export async function createEngagement(input: {
  accountId: string;
  neurona: string;
  currency: string;
  billingRule: string;
  startDate: string | null;
  endDate: string | null;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    const [row] = await db
      .insert(financeEngagements)
      .values({
        workspaceId,
        accountId: input.accountId,
        neurona: input.neurona,
        currency: input.currency,
        billingRule: input.billingRule,
        startDate: input.startDate,
        endDate: input.endDate,
        source: "manual",
      })
      .returning({ id: financeEngagements.id });
    if (!row) return { success: false, error: "No se pudo crear el engagement" };
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true, id: row.id };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 4. updateEngagement
// ---------------------------------------------------------------------------
export async function updateEngagement(input: {
  accountId: string;
  id: string;
  neurona: string;
  currency: string;
  billingRule: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
}): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db
      .update(financeEngagements)
      .set({
        neurona: input.neurona,
        currency: input.currency,
        billingRule: input.billingRule,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status,
        source: "manual",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeEngagements.id, input.id),
          eq(financeEngagements.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 5. deleteEngagement
// ---------------------------------------------------------------------------
export async function deleteEngagement(input: {
  accountId: string;
  id: string;
}): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db
      .delete(financeEngagements)
      .where(
        and(
          eq(financeEngagements.id, input.id),
          eq(financeEngagements.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 6. createPeriod
// ---------------------------------------------------------------------------
export async function createPeriod(input: {
  accountId: string;
  engagementId: string;
  fromDate: string;
  toDate: string | null;
  fee: number;
  currency: string;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    // Validate engagement belongs to this account
    const [engagement] = await db
      .select({ id: financeEngagements.id })
      .from(financeEngagements)
      .where(
        and(
          eq(financeEngagements.id, input.engagementId),
          eq(financeEngagements.accountId, input.accountId)
        )
      )
      .limit(1);
    if (!engagement) return { success: false, error: "Engagement no encontrado" };
    const [row] = await db
      .insert(financeEngagementPeriods)
      .values({
        workspaceId,
        accountId: input.accountId,
        engagementId: input.engagementId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        fee: String(input.fee),
        currency: input.currency,
        source: "manual",
      })
      .returning({ id: financeEngagementPeriods.id });
    if (!row) return { success: false, error: "No se pudo crear el período" };
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true, id: row.id };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 7. updatePeriod
// ---------------------------------------------------------------------------
export async function updatePeriod(input: {
  accountId: string;
  id: string;
  fromDate: string;
  toDate: string | null;
  fee: number;
  currency: string;
}): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db
      .update(financeEngagementPeriods)
      .set({
        fromDate: input.fromDate,
        toDate: input.toDate,
        fee: String(input.fee),
        currency: input.currency,
        source: "manual",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeEngagementPeriods.id, input.id),
          eq(financeEngagementPeriods.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 8. deletePeriod
// ---------------------------------------------------------------------------
export async function deletePeriod(input: {
  accountId: string;
  id: string;
}): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db
      .delete(financeEngagementPeriods)
      .where(
        and(
          eq(financeEngagementPeriods.id, input.id),
          eq(financeEngagementPeriods.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 9. createShare
// ---------------------------------------------------------------------------
export async function createShare(input: {
  accountId: string;
  engagementId: string;
  memberId: string | null;
  consultantNameRaw: string | null;
  shareType: string;
  shareValue: number;
  shareCurrency: string | null;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    // Validate engagement belongs to this account
    const [engagement] = await db
      .select({ id: financeEngagements.id })
      .from(financeEngagements)
      .where(
        and(
          eq(financeEngagements.id, input.engagementId),
          eq(financeEngagements.accountId, input.accountId)
        )
      )
      .limit(1);
    if (!engagement) return { success: false, error: "Engagement no encontrado" };
    const [row] = await db
      .insert(financeFeeShares)
      .values({
        workspaceId,
        accountId: input.accountId,
        engagementId: input.engagementId,
        memberId: input.memberId,
        consultantNameRaw: input.consultantNameRaw,
        shareType: input.shareType,
        shareValue: String(input.shareValue),
        shareCurrency: input.shareCurrency,
        source: "manual",
      })
      .returning({ id: financeFeeShares.id });
    if (!row) return { success: false, error: "No se pudo crear el fee share" };
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true, id: row.id };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 10. updateShare
// ---------------------------------------------------------------------------
export async function updateShare(input: {
  accountId: string;
  id: string;
  shareType: string;
  shareValue: number;
  shareCurrency: string | null;
  memberId: string | null;
}): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db
      .update(financeFeeShares)
      .set({
        shareType: input.shareType,
        shareValue: String(input.shareValue),
        shareCurrency: input.shareCurrency,
        memberId: input.memberId,
        source: "manual",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeFeeShares.id, input.id),
          eq(financeFeeShares.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 11. deleteShare
// ---------------------------------------------------------------------------
export async function deleteShare(input: {
  accountId: string;
  id: string;
}): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db
      .delete(financeFeeShares)
      .where(
        and(
          eq(financeFeeShares.id, input.id),
          eq(financeFeeShares.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// 12. mapShareMember
// ---------------------------------------------------------------------------
export async function mapShareMember(input: {
  accountId: string;
  id: string;
  memberId: string | null;
}): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db
      .update(financeFeeShares)
      .set({ memberId: input.memberId, updatedAt: new Date() })
      .where(
        and(
          eq(financeFeeShares.id, input.id),
          eq(financeFeeShares.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
