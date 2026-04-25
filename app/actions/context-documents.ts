"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { contextDocuments, accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";

const ALLOWED_DOC_TYPES = new Set([
  "note",
  "presentation",
  "report",
  "spreadsheet",
  "other",
]);

async function triggerSummaryRefresh(
  accountId: string,
  workspaceId: string
): Promise<void> {
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("refresh-account-summary", { accountId, workspaceId });
  } catch (err) {
    // Best-effort: don't block the upload if Trigger is unreachable.
    console.error("Failed to enqueue refresh-account-summary", err);
  }
}

async function triggerContextDocumentAnalysis(
  contextDocumentId: string,
  accountId: string,
  workspaceId: string
): Promise<void> {
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("analyze-context-document", {
      contextDocumentId,
      accountId,
      workspaceId,
    });
  } catch (err) {
    console.error("Failed to enqueue analyze-context-document", err);
  }
}

interface UploadContextDocumentInput {
  accountId: string;
  docType: string;
  title: string;
  notes: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  extractedText: string | null;
}

export async function uploadContextDocument(
  input: UploadContextDocumentInput
): Promise<{ id?: string; error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  const title = input.title.trim();
  if (!title) return { error: "El título es requerido" };

  const docType = ALLOWED_DOC_TYPES.has(input.docType) ? input.docType : "other";

  // Verify the account belongs to the workspace
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (!account) return { error: "Cuenta no encontrada" };

  const [row] = await db
    .insert(contextDocuments)
    .values({
      workspaceId: workspace.id,
      accountId: input.accountId,
      uploadedByUserId: userId,
      docType,
      title,
      notes: input.notes?.trim() || null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      extractedText: input.extractedText,
    })
    .returning({ id: contextDocuments.id });

  // Re-generate the account summary in the background so the new context
  // document influences "Resumen de situación" right away.
  await triggerSummaryRefresh(input.accountId, workspace.id);

  // Also pull tasks/commitments out of the document if it has any narrative
  // content. Skips automatically inside the task if the body is too thin.
  await triggerContextDocumentAnalysis(row.id, input.accountId, workspace.id);

  revalidatePath(`/app/accounts/${input.accountId}`);
  return { id: row.id };
}

export async function deleteContextDocument(docId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");

  const [doc] = await db
    .select({
      id: contextDocuments.id,
      accountId: contextDocuments.accountId,
      workspaceId: contextDocuments.workspaceId,
    })
    .from(contextDocuments)
    .where(eq(contextDocuments.id, docId))
    .limit(1);

  if (!doc || doc.workspaceId !== workspace.id) {
    throw new Error("Documento no encontrado");
  }

  await db.delete(contextDocuments).where(eq(contextDocuments.id, docId));
  revalidatePath(`/app/accounts/${doc.accountId}`);
}
