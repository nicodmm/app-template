"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  driveConnections,
  accounts,
  transcripts as transcriptsTable,
  contextDocuments as contextDocumentsTable,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import {
  ensureFreshAccessToken,
  listDriveFolders,
  type DriveFolder,
  type DriveFileMeta,
} from "@/lib/google/drive";
import {
  parseDriveFileIdFromUrl,
  parseDriveFolderIdFromUrl,
} from "@/lib/google/drive-links";

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

export async function setDriveLinkOnlySync(
  enabled: boolean
): Promise<{ error?: string }> {
  try {
    const { workspaceId } = await ensureManager();
    await db
      .update(driveConnections)
      .set({ linkOnlySync: enabled, updatedAt: new Date() })
      .where(eq(driveConnections.workspaceId, workspaceId));
    revalidatePath("/app/settings/workspace");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" };
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
  userNotes?: string,
  opts?: { skipTaskExtraction?: boolean }
): Promise<{
  outcome?: "queued" | "duplicate" | "folder_bound";
  fileName?: string;
  folderName?: string;
  error?: string;
}> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  // If the URL points at a folder, route to the folder-binding flow instead
  // of trying to import a single file.
  const folderId = parseDriveFolderIdFromUrl(url);
  if (folderId) {
    return bindFolderInternal(
      workspace.id,
      accountId,
      folderId,
      userId,
      opts?.skipTaskExtraction ?? false
    );
  }

  const fileId = parseDriveFileIdFromUrl(url);
  if (!fileId) {
    return {
      error:
        "Link inválido. Pegá una URL de un archivo o de una carpeta de Drive.",
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

  // Refresh token and fetch metadata quickly to fail fast on permission issues
  // before we enqueue. If this part takes long we time out at 8s and let the
  // user retry instead of hanging.
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

  let meta: DriveFileMeta;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,size`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (res.status === 404) {
      return {
        error:
          "El archivo no existe o tu cuenta de Google no tiene acceso. Compartilo con la cuenta conectada en Drive y probá de nuevo.",
      };
    }
    if (res.status === 403) {
      return {
        error:
          "Permiso insuficiente en Drive para leer el archivo. Compartilo con la cuenta conectada.",
      };
    }
    if (!res.ok) {
      return { error: `Drive devolvió ${res.status}. Probá de nuevo.` };
    }
    meta = (await res.json()) as DriveFileMeta;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Drive tardó demasiado en responder — probá de nuevo"
          : err.message
        : "No se pudo leer metadata del archivo";
    return { error: msg };
  }

  // Dedup check before queueing so we don't trigger a no-op task run.
  const existingTranscript = await db
    .select({ id: transcriptsTable.id })
    .from(transcriptsTable)
    .where(eq(transcriptsTable.googleDriveFileId, meta.id))
    .limit(1);
  const existingContext = await db
    .select({ id: contextDocumentsTable.id })
    .from(contextDocumentsTable)
    .where(eq(contextDocumentsTable.googleDriveFileId, meta.id))
    .limit(1);
  if (existingTranscript.length > 0 || existingContext.length > 0) {
    return { outcome: "duplicate", fileName: meta.name };
  }

  // Queue the actual download + extract + insert in a Trigger task so the
  // server action returns fast (before Vercel's serverless timeout).
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("import-drive-link", {
      workspaceId: workspace.id,
      accountId,
      fileId: meta.id,
      uploadedByUserId: userId,
      userNotes: userNotes ?? null,
      fileMeta: meta,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No se pudo encolar el import — ¿está Trigger.dev configurado?",
    };
  }

  revalidatePath(`/app/accounts/${accountId}`);
  return { outcome: "queued", fileName: meta.name };
}

/**
 * Bind a Drive folder to a specific account and kick off the initial sync.
 * Used by the public action above (when the user pastes a folder URL) and by
 * the explicit "Sincronizar ahora" button after binding.
 */
async function bindFolderInternal(
  workspaceId: string,
  accountId: string,
  folderId: string,
  userId: string,
  skipTaskExtraction: boolean
): Promise<{
  outcome: "folder_bound";
  folderName: string;
  error?: string;
}> {
  // Confirm the account belongs to this workspace.
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspaceId)))
    .limit(1);
  if (!account) {
    return { outcome: "folder_bound", folderName: "", error: "Cuenta no encontrada" };
  }

  // Drive connection on the workspace.
  const [conn] = await db
    .select({ id: driveConnections.id })
    .from(driveConnections)
    .where(eq(driveConnections.workspaceId, workspaceId))
    .limit(1);
  if (!conn) {
    return {
      outcome: "folder_bound",
      folderName: "",
      error:
        "Conectá Google Drive primero desde el Workspace para poder vincular carpetas.",
    };
  }

  // Resolve folder metadata so we know its name and that we have access.
  let accessToken: string;
  try {
    accessToken = await ensureFreshAccessToken(conn.id);
  } catch (err) {
    return {
      outcome: "folder_bound",
      folderName: "",
      error:
        err instanceof Error
          ? err.message
          : "No se pudo refrescar el token de Drive",
    };
  }

  let folderName: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (res.status === 404) {
      return {
        outcome: "folder_bound",
        folderName: "",
        error:
          "La carpeta no existe o tu cuenta de Google no tiene acceso. Compartila con la cuenta conectada en Drive.",
      };
    }
    if (res.status === 403) {
      return {
        outcome: "folder_bound",
        folderName: "",
        error:
          "Permiso insuficiente sobre la carpeta. Compartila con la cuenta conectada.",
      };
    }
    if (!res.ok) {
      return {
        outcome: "folder_bound",
        folderName: "",
        error: `Drive devolvió ${res.status}. Probá de nuevo.`,
      };
    }
    const meta = (await res.json()) as {
      id: string;
      name: string;
      mimeType: string;
    };
    if (meta.mimeType !== "application/vnd.google-apps.folder") {
      return {
        outcome: "folder_bound",
        folderName: "",
        error: "El link no apunta a una carpeta de Drive.",
      };
    }
    folderName = meta.name;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Drive tardó demasiado en responder — probá de nuevo"
          : err.message
        : "No se pudo leer metadata de la carpeta";
    return { outcome: "folder_bound", folderName: "", error: msg };
  }

  // Persist the binding.
  await db
    .update(accounts)
    .set({
      driveFolderId: folderId,
      driveFolderName: folderName,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));

  // Trigger the initial sync — best effort. The UI will keep showing
  // "vinculada" even if the trigger enqueue fails; user can hit "Sync ahora"
  // manually.
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("sync-drive-folder-for-account", {
      workspaceId,
      accountId,
      uploadedByUserId: userId,
      skipTaskExtraction,
    });
  } catch {
    // best-effort
  }

  revalidatePath(`/app/accounts/${accountId}`);
  return { outcome: "folder_bound", folderName };
}

export async function syncDriveFolderForAccountNow(
  accountId: string
): Promise<{ runId?: string; error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  const [acc] = await db
    .select({
      id: accounts.id,
      driveFolderId: accounts.driveFolderId,
    })
    .from(accounts)
    .where(
      and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id))
    )
    .limit(1);
  if (!acc) return { error: "Cuenta no encontrada" };
  if (!acc.driveFolderId)
    return { error: "Esta cuenta no tiene una carpeta de Drive vinculada" };

  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    const handle = await tasks.trigger("sync-drive-folder-for-account", {
      workspaceId: workspace.id,
      accountId,
      uploadedByUserId: userId,
    });
    revalidatePath(`/app/accounts/${accountId}`);
    return { runId: handle.id };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No se pudo encolar la sincronización",
    };
  }
}

export async function unlinkDriveFolderForAccount(
  accountId: string
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  await db
    .update(accounts)
    .set({
      driveFolderId: null,
      driveFolderName: null,
      driveFolderSyncedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id))
    );
  revalidatePath(`/app/accounts/${accountId}`);
  return {};
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
