"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  selectionSearches,
  selectionCandidates,
  accounts,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { createAdminClient, SELECTION_CV_BUCKET } from "@/lib/supabase/admin";
import { sanitizeStorageName } from "@/lib/storage/sanitize-filename";

type ActionResult = { success: boolean; error?: string; id?: string };

function rethrowIfRedirect(e: unknown): void {
  if (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    ((e as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (e as { digest: string }).digest === "NEXT_NOT_FOUND")
  ) {
    throw e;
  }
}

/** Ensures the account belongs to the caller's workspace. Returns workspaceId. */
async function requireAccountInWorkspace(accountId: string): Promise<string> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("No workspace");
  const [acct] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (!acct) throw new Error("Account not found in workspace");
  return workspace.id;
}

export async function createSearch(input: {
  accountId: string;
  position: string;
  positionDescription: string | null;
  razonSocial: string | null;
  cuit: string | null;
}): Promise<ActionResult> {
  try {
    const workspaceId = await requireAccountInWorkspace(input.accountId);
    if (!input.position.trim()) return { success: false, error: "Posición requerida" };
    const [row] = await db
      .insert(selectionSearches)
      .values({
        workspaceId,
        accountId: input.accountId,
        position: input.position.trim(),
        positionDescription: input.positionDescription,
        razonSocial: input.razonSocial,
        cuit: input.cuit,
      })
      .returning({ id: selectionSearches.id });
    if (!row) return { success: false, error: "Insert failed" };
    revalidatePath(`/app/accounts/${input.accountId}/selection`);
    return { success: true, id: row.id };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function updateSearch(input: {
  searchId: string;
  accountId: string;
  position: string;
  positionDescription: string | null;
  status: string;
  razonSocial: string | null;
  cuit: string | null;
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    await db
      .update(selectionSearches)
      .set({
        position: input.position.trim(),
        positionDescription: input.positionDescription,
        status: input.status,
        razonSocial: input.razonSocial,
        cuit: input.cuit,
        closedAt: input.status === "closed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selectionSearches.id, input.searchId),
          eq(selectionSearches.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection`);
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function createCandidate(input: {
  accountId: string;
  searchId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  expectedSalary: string | null;
  currentSalary: string | null;
}): Promise<ActionResult> {
  try {
    const workspaceId = await requireAccountInWorkspace(input.accountId);
    if (!input.firstName.trim() || !input.lastName.trim())
      return { success: false, error: "Nombre y apellido requeridos" };
    const [search] = await db
      .select({ id: selectionSearches.id })
      .from(selectionSearches)
      .where(
        and(
          eq(selectionSearches.id, input.searchId),
          eq(selectionSearches.accountId, input.accountId)
        )
      )
      .limit(1);
    if (!search) return { success: false, error: "Búsqueda no encontrada" };
    const [row] = await db
      .insert(selectionCandidates)
      .values({
        searchId: input.searchId,
        accountId: input.accountId,
        workspaceId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email,
        phone: input.phone,
        linkedinUrl: input.linkedinUrl,
        expectedSalary: input.expectedSalary,
        currentSalary: input.currentSalary,
      })
      .returning({ id: selectionCandidates.id });
    if (!row) return { success: false, error: "Insert failed" };
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true, id: row.id };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function updateCandidate(input: {
  accountId: string;
  searchId: string;
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  expectedSalary: string | null;
  currentSalary: string | null;
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    await db
      .update(selectionCandidates)
      .set({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email,
        phone: input.phone,
        linkedinUrl: input.linkedinUrl,
        expectedSalary: input.expectedSalary,
        currentSalary: input.currentSalary,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function deleteCandidate(input: {
  accountId: string;
  searchId: string;
  candidateId: string;
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    await db
      .delete(selectionCandidates)
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

/**
 * Upload a CV file binary to Storage and store its pre-extracted text.
 * Text is extracted client-side (pdfjs/mammoth) like context uploads.
 */
export async function uploadCandidateCv(input: {
  accountId: string;
  searchId: string;
  candidateId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  extractedText: string | null;
  fileBase64: string; // data without the "data:...;base64," prefix
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    const admin = createAdminClient();
    const path = `${input.accountId}/${input.candidateId}/${Date.now()}-${sanitizeStorageName(input.fileName)}`;
    const buffer = Buffer.from(input.fileBase64, "base64");
    const { error: upErr } = await admin.storage
      .from(SELECTION_CV_BUCKET)
      .upload(path, buffer, { contentType: input.mimeType, upsert: true });
    if (upErr) return { success: false, error: upErr.message };

    await db
      .update(selectionCandidates)
      .set({
        cvStoragePath: path,
        cvUrl: null,
        cvFileName: input.fileName,
        cvMimeType: input.mimeType,
        cvFileSize: input.fileSize,
        cvExtractedText: input.extractedText,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function setCandidateCvUrl(input: {
  accountId: string;
  searchId: string;
  candidateId: string;
  cvUrl: string;
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    await db
      .update(selectionCandidates)
      .set({
        cvUrl: input.cvUrl.trim() || null,
        cvStoragePath: null,
        cvFileName: null,
        cvMimeType: null,
        cvFileSize: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

/** Returns a temporary signed URL (or the external URL) to view the CV. */
export async function getCandidateCvUrl(input: {
  accountId: string;
  candidateId: string;
}): Promise<{ url: string | null; error?: string }> {
  try {
    await requireAccountInWorkspace(input.accountId);
    const [c] = await db
      .select({
        cvStoragePath: selectionCandidates.cvStoragePath,
        cvUrl: selectionCandidates.cvUrl,
      })
      .from(selectionCandidates)
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      )
      .limit(1);
    if (!c) return { url: null, error: "No candidate" };
    if (c.cvUrl) return { url: c.cvUrl };
    if (c.cvStoragePath) {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from(SELECTION_CV_BUCKET)
        .createSignedUrl(c.cvStoragePath, 60 * 10);
      if (error) return { url: null, error: error.message };
      return { url: data.signedUrl };
    }
    return { url: null };
  } catch (e) {
    rethrowIfRedirect(e);
    return { url: null, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function saveRecruiterNotes(input: {
  accountId: string;
  searchId: string;
  candidateId: string;
  recruiterNotes: string;
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    await db
      .update(selectionCandidates)
      .set({ recruiterNotes: input.recruiterNotes, updatedAt: new Date() })
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

/** Mark report as generating and enqueue the LLM task. */
export async function generateCandidateReport(input: {
  accountId: string;
  searchId: string;
  candidateId: string;
}): Promise<ActionResult> {
  try {
    const workspaceId = await requireAccountInWorkspace(input.accountId);
    await db
      .update(selectionCandidates)
      .set({
        reportStatus: "generating",
        reportError: null,
        // Generar por IA reemplaza un informe subido: limpiamos el archivo para
        // que el visor muestre el markdown generado, no el PDF viejo.
        reportStoragePath: null,
        reportFileName: null,
        reportMimeType: null,
        reportFileSize: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      );
    try {
      const { tasks } = await import("@trigger.dev/sdk/v3");
      await tasks.trigger("generate-selection-report", {
        candidateId: input.candidateId,
        workspaceId,
      });
    } catch (err) {
      console.error("Failed to enqueue generate-selection-report", err);
      await db
        .update(selectionCandidates)
        .set({ reportStatus: "error", reportError: "No se pudo encolar la tarea" })
        .where(
          and(
            eq(selectionCandidates.id, input.candidateId),
            eq(selectionCandidates.accountId, input.accountId)
          )
        );
      return { success: false, error: "No se pudo encolar la generación" };
    }
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

/**
 * Sube un informe ya hecho (PDF/Word) como archivo + guarda su texto extraído en
 * reportContent (para el portal del cliente). El visor muestra el archivo original.
 */
export async function uploadCandidateReport(input: {
  accountId: string;
  searchId: string;
  candidateId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  extractedText: string | null;
  fileBase64: string;
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    const admin = createAdminClient();
    const path = `${input.accountId}/${input.candidateId}/report-${Date.now()}-${sanitizeStorageName(input.fileName)}`;
    const buffer = Buffer.from(input.fileBase64, "base64");
    const { error: upErr } = await admin.storage
      .from(SELECTION_CV_BUCKET)
      .upload(path, buffer, { contentType: input.mimeType, upsert: true });
    if (upErr) return { success: false, error: upErr.message };

    await db
      .update(selectionCandidates)
      .set({
        reportStoragePath: path,
        reportFileName: input.fileName,
        reportMimeType: input.mimeType,
        reportFileSize: input.fileSize,
        // El texto extraído alimenta el portal del cliente (que muestra
        // reportContent). Si no se pudo extraer, dejamos el contenido previo.
        ...(input.extractedText && input.extractedText.trim()
          ? { reportContent: input.extractedText }
          : {}),
        reportStatus: "ready",
        reportError: null,
        reportEditedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

/** Signed URL (10 min) para ver el archivo de informe subido. */
export async function getCandidateReportUrl(input: {
  accountId: string;
  candidateId: string;
}): Promise<{ url: string | null; error?: string }> {
  try {
    await requireAccountInWorkspace(input.accountId);
    const [c] = await db
      .select({ reportStoragePath: selectionCandidates.reportStoragePath })
      .from(selectionCandidates)
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      )
      .limit(1);
    if (!c?.reportStoragePath) return { url: null };
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(SELECTION_CV_BUCKET)
      .createSignedUrl(c.reportStoragePath, 60 * 10);
    if (error) return { url: null, error: error.message };
    return { url: data.signedUrl };
  } catch (e) {
    rethrowIfRedirect(e);
    return { url: null, error: e instanceof Error ? e.message : "Error" };
  }
}

/** Manual edit of the report markdown by the admin. */
export async function saveCandidateReport(input: {
  accountId: string;
  searchId: string;
  candidateId: string;
  reportContent: string;
}): Promise<ActionResult> {
  try {
    await requireAccountInWorkspace(input.accountId);
    await db
      .update(selectionCandidates)
      .set({
        reportContent: input.reportContent,
        reportStatus: "ready",
        reportEditedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selectionCandidates.id, input.candidateId),
          eq(selectionCandidates.accountId, input.accountId)
        )
      );
    revalidatePath(`/app/accounts/${input.accountId}/selection/${input.searchId}`);
    return { success: true };
  } catch (e) {
    rethrowIfRedirect(e);
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
