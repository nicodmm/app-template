import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { driveConnections, accounts } from "@/lib/drizzle/schema";
import {
  ensureFreshAccessToken,
  listDriveFolderFiles,
} from "@/lib/google/drive";
import {
  resolveAccountByFilename,
  resolveAccountByContent,
  deriveDomain,
  normalize,
  type AccountMatchOption,
} from "@/lib/google/account-matching";
import { importDriveFileForAccount, extractDriveFileText } from "@/lib/google/drive-import";

interface SyncDriveFolderInput {
  connectionId: string;
}

export const syncDriveFolder = task({
  id: "sync-drive-folder",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 10000, factor: 2 },
  run: async (
    payload: SyncDriveFolderInput
  ): Promise<{ imported: number; skipped: number }> => {
    let imported = 0;
    let skipped = 0;

    const [connection] = await db
      .select()
      .from(driveConnections)
      .where(eq(driveConnections.id, payload.connectionId))
      .limit(1);

    if (!connection) {
      logger.warn("Drive connection not found", { connectionId: payload.connectionId });
      return { imported, skipped };
    }
    if (!connection.folderId) {
      logger.info("Connection has no folder configured — skipping", {
        connectionId: payload.connectionId,
      });
      return { imported, skipped };
    }

    try {
      const accessToken = await ensureFreshAccessToken(connection.id);

      // First sync (lastSyncAt is null) is capped at the 24 most recent files
      // by modifiedTime — gives a 6-month-ish historical window without
      // dragging in years of meeting docs. Subsequent syncs scan up to 100
      // (top of folder) and let the dedup index keep things idempotent.
      const isFirstSync = connection.lastSyncAt === null;
      const HISTORICAL_LIMIT = 24;
      const INCREMENTAL_LIMIT = 100;
      const files = await listDriveFolderFiles(accessToken, connection.folderId, {
        limit: isFirstSync ? HISTORICAL_LIMIT : INCREMENTAL_LIMIT,
      });

      const workspaceAccounts = await db
        .select({ id: accounts.id, name: accounts.name, websiteUrl: accounts.websiteUrl })
        .from(accounts)
        .where(eq(accounts.workspaceId, connection.workspaceId));

      const accountOptions: AccountMatchOption[] = workspaceAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        normalizedName: normalize(a.name),
        domain: deriveDomain(a.websiteUrl),
      }));

      for (const file of files) {
        // Paso 1: nombre de archivo (rápido, sin descarga).
        let matchedAccountId =
          resolveAccountByFilename(file.name, accountOptions)?.id ?? null;
        let prefetchedText: string | null = null;

        // Paso 2: contenido — solo si no matcheó por nombre y NO es link-only.
        if (!matchedAccountId && !(connection.linkOnlySync ?? false)) {
          const text = await extractDriveFileText(accessToken, file);
          if (text) {
            const res = resolveAccountByContent(text, accountOptions);
            if (res.kind === "matched") {
              matchedAccountId = res.account.id;
              prefetchedText = text;
            } else if (res.kind === "ambiguous") {
              logger.info("Content match ambiguo — no se importa", {
                fileName: file.name,
              });
            }
          }
        }

        if (!matchedAccountId) {
          logger.info("Sin cuenta para el archivo — skip", { fileName: file.name });
          skipped += 1;
          continue;
        }

        const outcome = await importDriveFileForAccount({
          file,
          accessToken,
          workspaceId: connection.workspaceId,
          accountId: matchedAccountId,
          uploadedByUserId: connection.connectedByUserId,
          source: "drive_sync",
          linkOnly: connection.linkOnlySync ?? false,
          prefetchedText,
        });
        if (outcome === "imported") imported += 1;
        else skipped += 1;
      }

      await db
        .update(driveConnections)
        .set({
          lastSyncAt: new Date(),
          lastError: null,
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(driveConnections.id, connection.id));

      logger.info("Drive sync completed", {
        connectionId: payload.connectionId,
        imported,
        skipped,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "sync_failed";
      logger.error("Drive sync error", { connectionId: payload.connectionId, message });
      await db
        .update(driveConnections)
        .set({
          status: "error",
          lastError: message.substring(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(driveConnections.id, connection.id));
    }

    return { imported, skipped };
  },
});

/**
 * Scheduled wrapper: run every 30 minutes against every connected drive.
 */
export const syncAllDriveFolders = schedules.task({
  id: "sync-all-drive-folders",
  cron: "*/30 * * * *",
  run: async (): Promise<void> => {
    const connected = await db
      .select({ id: driveConnections.id })
      .from(driveConnections)
      .where(and(eq(driveConnections.status, "connected")));

    for (const c of connected) {
      try {
        await syncDriveFolder.trigger({ connectionId: c.id });
      } catch (err) {
        logger.warn("Failed to enqueue sync-drive-folder for connection", {
          connectionId: c.id,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  },
});
