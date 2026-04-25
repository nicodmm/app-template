"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { driveConnections } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import {
  ensureFreshAccessToken,
  listDriveFolders,
  type DriveFolder,
} from "@/lib/google/drive";

async function ensureManager(): Promise<{ workspaceId: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw new Error("No tenés permisos");
  }
  return { workspaceId: workspace.id };
}

export async function listDriveFoldersForWorkspace(
  search?: string
): Promise<{ folders?: DriveFolder[]; error?: string }> {
  try {
    const { workspaceId } = await ensureManager();
    const [conn] = await db
      .select()
      .from(driveConnections)
      .where(eq(driveConnections.workspaceId, workspaceId))
      .limit(1);
    if (!conn) return { error: "Drive no está conectado" };
    const accessToken = await ensureFreshAccessToken(conn.id);
    const folders = await listDriveFolders(accessToken, search);
    return { folders };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo listar carpetas",
    };
  }
}

export async function setDriveFolder(
  folderId: string,
  folderName: string
): Promise<{ error?: string }> {
  try {
    const { workspaceId } = await ensureManager();
    await db
      .update(driveConnections)
      .set({
        folderId,
        folderName,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(driveConnections.workspaceId, workspaceId));
    revalidatePath("/app/settings/workspace");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" };
  }
}

export async function disconnectDrive(): Promise<void> {
  const { workspaceId } = await ensureManager();
  await db
    .delete(driveConnections)
    .where(eq(driveConnections.workspaceId, workspaceId));
  revalidatePath("/app/settings/workspace");
}

export async function syncDriveNow(): Promise<{ runId?: string; error?: string }> {
  try {
    const { workspaceId } = await ensureManager();
    const [conn] = await db
      .select({ id: driveConnections.id, folderId: driveConnections.folderId })
      .from(driveConnections)
      .where(eq(driveConnections.workspaceId, workspaceId))
      .limit(1);
    if (!conn) return { error: "Drive no está conectado" };
    if (!conn.folderId) return { error: "Configurá una carpeta primero" };

    const { tasks } = await import("@trigger.dev/sdk/v3");
    const handle = await tasks.trigger("sync-drive-folder", {
      connectionId: conn.id,
    });
    return { runId: handle.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo disparar el sync" };
  }
}
