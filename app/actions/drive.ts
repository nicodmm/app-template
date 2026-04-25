"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { driveConnections, accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import {
  ensureFreshAccessToken,
  listDriveFolders,
  type DriveFolder,
  type DriveFileMeta,
} from "@/lib/google/drive";
import {
  importDriveFileForAccount,
  parseDriveFileIdFromUrl,
} from "@/lib/google/drive-import";

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

export async function importDriveLinkForAccount(
  accountId: string,
  url: string,
  userNotes?: string
): Promise<{ outcome?: "imported" | "duplicate" | "skipped"; fileName?: string; error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  const fileId = parseDriveFileIdFromUrl(url);
  if (!fileId) {
    return {
      error: "Link inválido. Pegá una URL de un archivo de Drive (no una carpeta).",
    };
  }

  // Confirm account belongs to this workspace.
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (!account) return { error: "Cuenta no encontrada" };

  // Must have an active Drive connection on this workspace.
  const [conn] = await db
    .select({ id: driveConnections.id })
    .from(driveConnections)
    .where(eq(driveConnections.workspaceId, workspace.id))
    .limit(1);
  if (!conn) {
    return {
      error:
        "Conectá Google Drive primero desde el Workspace para poder importar links.",
    };
  }

  let accessToken: string;
  try {
    accessToken = await ensureFreshAccessToken(conn.id);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No se pudo refrescar el token de Drive",
    };
  }

  // Fetch file metadata.
  let meta: DriveFileMeta;
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const text = await res.text();
      return {
        error: `No se pudo leer el archivo (${res.status}). ¿Está compartido con tu cuenta de Google?${text ? " " + text.substring(0, 200) : ""}`,
      };
    }
    meta = (await res.json()) as DriveFileMeta;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo leer metadata del archivo",
    };
  }

  const outcome = await importDriveFileForAccount({
    file: meta,
    accessToken,
    workspaceId: workspace.id,
    accountId,
    uploadedByUserId: userId,
    userNotes: userNotes ?? null,
    source: "drive_link",
  });

  revalidatePath(`/app/accounts/${accountId}`);
  return { outcome, fileName: meta.name };
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
