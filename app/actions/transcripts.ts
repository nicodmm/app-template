"use server";

import crypto from "crypto";
import { db } from "@/lib/drizzle/db";
import { transcripts, accounts, driveConnections } from "@/lib/drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import { getTranscriptByHash } from "@/lib/queries/transcripts";
import { ensureFreshAccessToken, getDriveFileMeta } from "@/lib/google/drive";
import { extractDriveFileText } from "@/lib/google/drive-import";
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

/**
 * Reprocesa una reunión. Si vino de Drive, re-baja la ÚLTIMA versión del archivo
 * (cubre el caso de que el meet siguiera y Tactiq actualizara el doc), actualiza
 * el contenido y vuelve a correr el pipeline COMPLETO con extracción de tareas
 * (a diferencia del bind inicial, que la saltea). Para transcripciones que no son
 * de Drive, reprocesa el contenido ya guardado.
 */
export async function reprocessTranscript(
  transcriptId: string
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  const [t] = await db
    .select()
    .from(transcripts)
    .where(
      and(eq(transcripts.id, transcriptId), eq(transcripts.workspaceId, workspace.id))
    )
    .limit(1);
  if (!t) return { error: "Transcripción no encontrada" };

  let content = t.content;

  // Si vino de Drive, intentar re-bajar la versión más reciente del archivo.
  if (t.googleDriveFileId) {
    try {
      const [acc] = await db
        .select({ connId: accounts.driveFolderConnectionId })
        .from(accounts)
        .where(eq(accounts.id, t.accountId))
        .limit(1);
      let connId = acc?.connId ?? null;
      if (!connId) {
        const [c] = await db
          .select({ id: driveConnections.id })
          .from(driveConnections)
          .where(eq(driveConnections.workspaceId, workspace.id))
          .limit(1);
        connId = c?.id ?? null;
      }
      if (connId) {
        const token = await ensureFreshAccessToken(connId);
        const meta = await getDriveFileMeta(token, t.googleDriveFileId);
        const fresh = await extractDriveFileText(token, meta);
        if (fresh && fresh.trim().split(/\s+/).length >= 10) {
          content = fresh;
        }
      }
    } catch {
      // best-effort: si falla la re-bajada, reprocesamos el contenido guardado.
    }
  }

  const changed = content !== t.content;
  await db
    .update(transcripts)
    .set({
      ...(changed
        ? {
            content,
            contentHash: hashContent(normalizeContent(content)),
            wordCount: content.trim().split(/\s+/).length,
          }
        : {}),
      status: "pending",
      progressPercentage: 0,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(transcripts.id, transcriptId));

  const { processTranscript } = await import("@/trigger/workflows/process-transcript");
  const run = await processTranscript.trigger({
    transcriptId: t.id,
    accountId: t.accountId,
    workspaceId: t.workspaceId,
    content,
  });

  await db
    .update(transcripts)
    .set({ triggerJobId: run.id })
    .where(eq(transcripts.id, transcriptId));

  revalidatePath(`/app/accounts/${t.accountId}`);
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
