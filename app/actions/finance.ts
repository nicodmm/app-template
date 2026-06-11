"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accounts,
  accountFinance,
  accountConsultants,
  fxRates,
  billingRecords,
  memberCompensation,
  workspaceMembers,
  financeProjectionAssumptions,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import { createAdminClient, FINANCE_DOCS_BUCKET } from "@/lib/supabase/admin";
import { getFxRate } from "@/lib/queries/finance";
import { convertToArs } from "@/lib/finance/compute";
import { runMonthlyBilling } from "@/lib/finance/run-monthly-billing";

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

/** Require finance-admin in the caller's workspace. Returns { workspaceId, userId }. */
async function requireFinanceWorkspace(): Promise<{ workspaceId: string; userId: string }> {
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
  return { workspaceId: workspace.id, userId };
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

/**
 * Sanea un nombre de archivo para usarlo como clave de Supabase Storage. Las
 * claves no admiten espacios, comas ni varios símbolos (rompen con "Invalid
 * key"). Conservamos letras/números ASCII, punto, guion y guion bajo; el resto
 * se colapsa a "_". El nombre original se guarda aparte para mostrar.
 */
function sanitizeStorageName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // quitar acentos
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+/, "")
    .slice(0, 120);
  return cleaned || "archivo";
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

export async function saveAccountFinanceFields(input: {
  accountId: string;
  fields: Partial<{
    razonSocial: string | null;
    cuit: string | null;
    billingEmail: string | null;
    ivaCondition: string | null;
    leadOrigin: string | null;
    clientEmail: string | null;
    clientResponsible: string | null;
    legalRepName: string | null;
    legalRepDni: string | null;
    legalRepEmail: string | null;
    legalAddress: string | null;
    city: string | null;
    country: string | null;
  }>;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    await ensureAccountFinance(input.accountId, workspaceId);
    await db
      .update(accountFinance)
      .set({ ...input.fields, updatedAt: new Date() })
      .where(eq(accountFinance.accountId, input.accountId));
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function setAccountInvoiceCountry(input: {
  accountId: string;
  country: "AR" | "US" | null;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    await ensureAccountFinance(input.accountId, workspaceId);
    await db
      .update(accountFinance)
      .set({ invoiceCountry: input.country, updatedAt: new Date() })
      .where(eq(accountFinance.accountId, input.accountId));
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function addAccountConsultant(input: {
  accountId: string;
  userId: string;
  neurona: string | null;
  roleLabel: string | null;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    const [m] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, input.userId)))
      .limit(1);
    if (!m) return { success: false, error: "Usuario no pertenece al workspace" };
    const [row] = await db
      .insert(accountConsultants)
      .values({
        workspaceId,
        accountId: input.accountId,
        userId: input.userId,
        neurona: input.neurona,
        roleLabel: input.roleLabel,
      })
      .returning({ id: accountConsultants.id });
    if (!row) return { success: false, error: "No se pudo agregar" };
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true, id: row.id };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function removeAccountConsultant(input: {
  accountId: string;
  id: string;
}): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db
      .delete(accountConsultants)
      .where(
        and(
          eq(accountConsultants.id, input.id),
          eq(accountConsultants.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function uploadFinanceDoc(input: {
  accountId: string;
  kind: "nda" | "proposal";
  fileName: string;
  mimeType: string;
  fileSize: number;
  extractedText: string | null;
  fileBase64: string;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    await ensureAccountFinance(input.accountId, workspaceId);
    const admin = createAdminClient();
    const path = `${input.accountId}/${input.kind}/${Date.now()}-${sanitizeStorageName(input.fileName)}`;
    const buffer = Buffer.from(input.fileBase64, "base64");
    const { error: upErr } = await admin.storage
      .from(FINANCE_DOCS_BUCKET)
      .upload(path, buffer, { contentType: input.mimeType, upsert: true });
    if (upErr) return { success: false, error: upErr.message };
    const set =
      input.kind === "nda"
        ? {
            ndaStoragePath: path,
            ndaUrl: null,
            ndaFileName: input.fileName,
            ndaExtractedText: input.extractedText,
            updatedAt: new Date(),
          }
        : {
            proposalStoragePath: path,
            proposalUrl: null,
            proposalFileName: input.fileName,
            updatedAt: new Date(),
          };
    await db
      .update(accountFinance)
      .set(set)
      .where(eq(accountFinance.accountId, input.accountId));
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function setFinanceDocUrl(input: {
  accountId: string;
  kind: "nda" | "proposal";
  url: string;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    await ensureAccountFinance(input.accountId, workspaceId);
    const trimmed = input.url.trim() || null;
    const set =
      input.kind === "nda"
        ? { ndaUrl: trimmed, ndaStoragePath: null, updatedAt: new Date() }
        : { proposalUrl: trimmed, proposalStoragePath: null, updatedAt: new Date() };
    await db
      .update(accountFinance)
      .set(set)
      .where(eq(accountFinance.accountId, input.accountId));
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function extractNda(input: { accountId: string }): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    await ensureAccountFinance(input.accountId, workspaceId);
    await db
      .update(accountFinance)
      .set({ ndaExtractionStatus: "extracting", ndaExtractionError: null, updatedAt: new Date() })
      .where(eq(accountFinance.accountId, input.accountId));
    try {
      const { tasks } = await import("@trigger.dev/sdk/v3");
      await tasks.trigger("extract-nda-fields", { accountId: input.accountId, workspaceId });
    } catch (err) {
      await db
        .update(accountFinance)
        .set({ ndaExtractionStatus: "error", ndaExtractionError: "No se pudo encolar" })
        .where(eq(accountFinance.accountId, input.accountId));
      return { success: false, error: "No se pudo encolar la extracción" };
    }
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function upsertFxRate(input: {
  year: number;
  month: number;
  mepRate: number;
  ipcCoefficient: number | null;
}): Promise<R> {
  try {
    const { workspaceId, userId } = await requireFinanceWorkspace();
    if (input.month < 1 || input.month > 12) return { success: false, error: "Mes inválido" };
    await db
      .insert(fxRates)
      .values({
        workspaceId,
        year: input.year,
        month: input.month,
        mepRate: String(input.mepRate),
        ipcCoefficient: input.ipcCoefficient == null ? "1" : String(input.ipcCoefficient),
        createdByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [fxRates.workspaceId, fxRates.year, fxRates.month],
        set: {
          mepRate: String(input.mepRate),
          ipcCoefficient: input.ipcCoefficient == null ? "1" : String(input.ipcCoefficient),
          updatedAt: new Date(),
        },
      });
    revalidatePath("/app/finanzas");
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function getFinanceDocUrl(input: {
  accountId: string;
  kind: "nda" | "proposal";
}): Promise<{ url: string | null; error?: string }> {
  try {
    await requireFinanceAccount(input.accountId);
    const [row] = await db
      .select({
        ndaStoragePath: accountFinance.ndaStoragePath,
        ndaUrl: accountFinance.ndaUrl,
        proposalStoragePath: accountFinance.proposalStoragePath,
        proposalUrl: accountFinance.proposalUrl,
      })
      .from(accountFinance)
      .where(eq(accountFinance.accountId, input.accountId))
      .limit(1);
    if (!row) return { url: null };
    const storagePath =
      input.kind === "nda" ? row.ndaStoragePath : row.proposalStoragePath;
    const externalUrl =
      input.kind === "nda" ? row.ndaUrl : row.proposalUrl;
    if (externalUrl) return { url: externalUrl };
    if (storagePath) {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from(FINANCE_DOCS_BUCKET)
        .createSignedUrl(storagePath, 60 * 10);
      if (error) return { url: null, error: error.message };
      return { url: data.signedUrl };
    }
    return { url: null };
  } catch (e) {
    rethrowIfRedirect(e);
    return { url: null, error: e instanceof Error ? e.message : "Error" };
  }
}

/**
 * Generate (upsert) monthly billing rows from active engagements for the given
 * month. One row per (account, engagement) for the active period, with
 * USD→ARS conversion applied per the engagement billing rule. Only the
 * amount-related fields are touched on re-generation — status/billedAt/paidAt
 * are preserved.
 */
export async function generateBillingForMonth(input: {
  year: number;
  month: number;
}): Promise<{ success: boolean; error?: string; created?: number; updated?: number }> {
  try {
    const { workspaceId } = await requireFinanceWorkspace();
    const { year, month } = input;
    if (month < 1 || month > 12) return { success: false, error: "Mes inválido" };

    const { created, updated } = await runMonthlyBilling(workspaceId, year, month);

    revalidatePath("/app/finanzas");
    return { success: true, created, updated };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function setBillingStatus(input: {
  id: string;
  status: "pending" | "billed" | "paid";
}): Promise<R> {
  try {
    const { workspaceId } = await requireFinanceWorkspace();
    await db
      .update(billingRecords)
      .set({
        status: input.status,
        billedAt: input.status === "pending" ? null : new Date(),
        paidAt: input.status === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(billingRecords.id, input.id), eq(billingRecords.workspaceId, workspaceId))
      );
    revalidatePath("/app/finanzas");
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function addBillingCharge(input: {
  accountId: string;
  year: number;
  month: number;
  concept: string;
  amount: number;
  currency: string;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    if (input.month < 1 || input.month > 12) return { success: false, error: "Mes inválido" };
    if (!input.concept.trim()) return { success: false, error: "Concepto requerido" };
    if (isNaN(input.amount)) return { success: false, error: "Monto inválido" };
    const fx = await getFxRate(workspaceId, input.year, input.month);
    const ars = convertToArs(
      input.amount,
      input.currency,
      input.currency === "ARS" ? "same" : "mep",
      fx?.mepRate ?? null,
      fx?.ipcCoefficient ?? null
    );
    const [row] = await db
      .insert(billingRecords)
      .values({
        workspaceId,
        accountId: input.accountId,
        engagementId: null,
        year: input.year,
        month: input.month,
        concept: input.concept.trim(),
        amountOriginal: String(input.amount),
        currencyOriginal: input.currency,
        amountArs: ars == null ? null : String(ars),
        fxRateUsed: fx ? String(fx.mepRate) : null,
        ipcUsed: fx ? String(fx.ipcCoefficient) : null,
        status: "pending",
        isAdditional: true,
      })
      .returning({ id: billingRecords.id });
    revalidatePath("/app/finanzas");
    return { success: true, id: row?.id };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function deleteBillingCharge(input: { id: string }): Promise<R> {
  try {
    const { workspaceId } = await requireFinanceWorkspace();
    await db
      .delete(billingRecords)
      .where(
        and(
          eq(billingRecords.id, input.id),
          eq(billingRecords.workspaceId, workspaceId),
          eq(billingRecords.isAdditional, true)
        )
      );
    revalidatePath("/app/finanzas");
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function setMemberCompensation(input: {
  userId: string;
  amount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}): Promise<R> {
  try {
    const { workspaceId } = await requireFinanceWorkspace();
    const [row] = await db
      .insert(memberCompensation)
      .values({
        workspaceId,
        userId: input.userId,
        amount: String(input.amount),
        currency: input.currency,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
      })
      .returning({ id: memberCompensation.id });
    if (!row) return { success: false, error: "No se pudo guardar" };
    revalidatePath("/app/finanzas");
    return { success: true, id: row.id };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function deleteMemberCompensation(input: { id: string }): Promise<R> {
  try {
    const { workspaceId } = await requireFinanceWorkspace();
    await db
      .delete(memberCompensation)
      .where(
        and(
          eq(memberCompensation.id, input.id),
          eq(memberCompensation.workspaceId, workspaceId)
        )
      );
    revalidatePath("/app/finanzas");
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function upsertProjectionAssumptions(input: {
  breakevenUsd: number;
  otrosIngresosUsd: number;
  clientesNuevosMes: number;
  ticketMedioNuevoUsd: number;
  churnUsdMes: number;
  horizonteMeses: number;
}): Promise<R> {
  try {
    const { workspaceId, userId } = await requireFinanceWorkspace();
    const horizonte = input.horizonteMeses === 18 ? 18 : 6;
    const num = (n: number) => (Number.isFinite(n) ? n : 0).toString();
    await db
      .insert(financeProjectionAssumptions)
      .values({
        workspaceId,
        breakevenUsd: num(input.breakevenUsd),
        otrosIngresosUsd: num(input.otrosIngresosUsd),
        clientesNuevosMes: Math.trunc(input.clientesNuevosMes) || 0,
        ticketMedioNuevoUsd: num(input.ticketMedioNuevoUsd),
        churnUsdMes: num(input.churnUsdMes),
        horizonteMeses: horizonte,
        updatedByUserId: userId,
      })
      .onConflictDoUpdate({
        target: financeProjectionAssumptions.workspaceId,
        set: {
          breakevenUsd: num(input.breakevenUsd),
          otrosIngresosUsd: num(input.otrosIngresosUsd),
          clientesNuevosMes: Math.trunc(input.clientesNuevosMes) || 0,
          ticketMedioNuevoUsd: num(input.ticketMedioNuevoUsd),
          churnUsdMes: num(input.churnUsdMes),
          horizonteMeses: horizonte,
          updatedByUserId: userId,
          updatedAt: new Date(),
        },
      });
    revalidatePath("/app/finanzas");
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
