"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accounts, accountFinance, accountConsultants } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import { createAdminClient, FINANCE_DOCS_BUCKET } from "@/lib/supabase/admin";

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

export async function addAccountConsultant(input: {
  accountId: string;
  userId: string;
  neurona: string | null;
  roleLabel: string | null;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
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
    const path = `${input.accountId}/${input.kind}/${Date.now()}-${input.fileName}`;
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
