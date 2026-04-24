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
