"use server";

import crypto from "crypto";
import { db } from "@/lib/drizzle/db";
import { transcripts } from "@/lib/drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import { getTranscriptByHash } from "@/lib/queries/transcripts";
import { revalidatePath } from "next/cache";

type UploadResult =
  | { transcriptId: string; runId: string }
  | { error: string }
  | { warning: "duplicate"; previousDate: Date };

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function uploadTranscript(
  accountId: string,
  content: string,
  fileName?: string,
  sourceType: "paste" | "file" = "paste"
): Promise<UploadResult> {
  const userId = await requireUserId();

  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  const account = await getAccountById(accountId, workspace.id);
  if (!account) return { error: "Cuenta no encontrada" };

  if (!content?.trim()) return { error: "El contenido de la transcripción es requerido" };

  const wordCount = content.trim().split(/\s+/).length;
  if (wordCount < 10) return { error: "La transcripción es demasiado corta" };

  const normalized = normalizeContent(content);
  const contentHash = hashContent(normalized);

  const duplicate = await getTranscriptByHash(accountId, contentHash);
  if (duplicate) {
    return { warning: "duplicate", previousDate: duplicate.createdAt };
  }

  const [transcript] = await db
    .insert(transcripts)
    .values({
      accountId,
      workspaceId: workspace.id,
      uploadedBy: userId,
      fileName: fileName ?? null,
      sourceType,
      content,
      contentHash,
      wordCount,
      status: "pending",
    })
    .returning();

  // Dynamically import to avoid bundling Trigger.dev in the server action module at top level
  const { processTranscript } = await import("@/trigger/workflows/process-transcript");
  const run = await processTranscript.trigger({
    transcriptId: transcript.id,
    accountId,
    workspaceId: workspace.id,
    content,
  });

  await db
    .update(transcripts)
    .set({ triggerJobId: run.id })
    .where(eq(transcripts.id, transcript.id));

  revalidatePath(`/app/accounts/${accountId}`);

  return { transcriptId: transcript.id, runId: run.id };
}

export async function retryTranscript(transcriptId: string): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  const rows = await db
    .select()
    .from(transcripts)
    .where(
      and(eq(transcripts.id, transcriptId), eq(transcripts.workspaceId, workspace.id))
    )
    .limit(1);

  const transcript = rows[0];
  if (!transcript) return { error: "Transcripción no encontrada" };

  await db
    .update(transcripts)
    .set({ status: "pending", progressPercentage: 0, errorMessage: null })
    .where(eq(transcripts.id, transcriptId));

  const { processTranscript } = await import("@/trigger/workflows/process-transcript");
  const run = await processTranscript.trigger({
    transcriptId: transcript.id,
    accountId: transcript.accountId,
    workspaceId: transcript.workspaceId,
    content: transcript.content,
  });

  await db
    .update(transcripts)
    .set({ triggerJobId: run.id })
    .where(eq(transcripts.id, transcriptId));

  return {};
}

export async function bulkDeleteTranscripts(
  transcriptIds: string[],
  accountId: string
): Promise<{ error?: string }> {
  if (transcriptIds.length === 0) return {};
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  await db
    .delete(transcripts)
    .where(
      and(
        inArray(transcripts.id, transcriptIds),
        eq(transcripts.workspaceId, workspace.id)
      )
    );

  revalidatePath(`/app/accounts/${accountId}`);
  return {};
}

export async function deleteTranscript(
  transcriptId: string,
  accountId: string
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  await db
    .delete(transcripts)
    .where(
      and(
        eq(transcripts.id, transcriptId),
        eq(transcripts.workspaceId, workspace.id)
      )
    );

  revalidatePath(`/app/accounts/${accountId}`);
  return {};
}
