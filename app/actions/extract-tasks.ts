"use server";

import { db } from "@/lib/drizzle/db";
import { transcripts, contextDocuments } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { canAccessAccountTasks } from "@/lib/queries/task-access";
import { revalidatePath } from "next/cache";

async function authorizeAccount(
  accountId: string
): Promise<{ workspaceId: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const ok = await canAccessAccountTasks(userId, workspace.id, accountId);
  if (!ok) throw new Error("Sin acceso a esta cuenta");
  return { workspaceId: workspace.id };
}

/**
 * Extrae tareas de una reunión YA importada en la cuenta. Reusa el task
 * `extract-tasks`, que deduplica contra las tareas existentes (sumar sin
 * borrar) y registra menciones por transcripción.
 */
export async function extractTasksFromTranscript(
  accountId: string,
  transcriptId: string
): Promise<{ ok?: true; error?: string }> {
  try {
    const { workspaceId } = await authorizeAccount(accountId);
    const [t] = await db
      .select({ id: transcripts.id, content: transcripts.content })
      .from(transcripts)
      .where(
        and(
          eq(transcripts.id, transcriptId),
          eq(transcripts.accountId, accountId),
          eq(transcripts.workspaceId, workspaceId)
        )
      )
      .limit(1);
    if (!t) return { error: "No se encontró la reunión." };
    if (!t.content || t.content.trim().length < 20) {
      return { error: "La reunión no tiene texto para analizar." };
    }

    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("extract-tasks", {
      transcriptId: t.id,
      accountId,
      workspaceId,
      cleanedContent: t.content,
    });

    revalidatePath("/app/tareas/[accountId]", "page");
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo iniciar la extracción.",
    };
  }
}

/**
 * Extrae tareas de un documento de contexto de la cuenta. Reusa
 * `analyze-context-document` en modo additive (no borra, solo agrega lo nuevo).
 */
export async function extractTasksFromContextDoc(
  accountId: string,
  contextDocumentId: string
): Promise<{ ok?: true; error?: string }> {
  try {
    const { workspaceId } = await authorizeAccount(accountId);
    const [d] = await db
      .select({ id: contextDocuments.id })
      .from(contextDocuments)
      .where(
        and(
          eq(contextDocuments.id, contextDocumentId),
          eq(contextDocuments.accountId, accountId),
          eq(contextDocuments.workspaceId, workspaceId)
        )
      )
      .limit(1);
    if (!d) return { error: "No se encontró el documento." };

    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("analyze-context-document", {
      contextDocumentId: d.id,
      accountId,
      workspaceId,
      additive: true,
    });

    revalidatePath("/app/tareas/[accountId]", "page");
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo iniciar la extracción.",
    };
  }
}
