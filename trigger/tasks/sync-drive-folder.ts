import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { driveConnections, accounts } from "@/lib/drizzle/schema";
import {
  ensureFreshAccessToken,
  listDriveFolderFiles,
  type DriveFileMeta,
} from "@/lib/google/drive";
import { importDriveFileForAccount } from "@/lib/google/drive-import";

interface SyncDriveFolderInput {
  connectionId: string;
}

const ACCENT_MAP: Record<string, string> = {
  á: "a", à: "a", ä: "a", â: "a", ã: "a",
  é: "e", è: "e", ë: "e", ê: "e",
  í: "i", ì: "i", ï: "i", î: "i",
  ó: "o", ò: "o", ö: "o", ô: "o", õ: "o",
  ú: "u", ù: "u", ü: "u", û: "u",
  ñ: "n",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => ACCENT_MAP[ch] ?? ch)
    .join("");
}

interface AccountOption {
  id: string;
  name: string;
  normalizedName: string;
}

function matchAccountByFilename(
  fileName: string,
  options: AccountOption[]
): AccountOption | null {
  const norm = normalize(fileName);
  const matches = options.filter((a) => norm.includes(a.normalizedName));
  if (matches.length === 0) return null;
  return matches.sort(
    (a, b) => b.normalizedName.length - a.normalizedName.length
  )[0];
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
      const files = await listDriveFolderFiles(accessToken, connection.folderId);

      const workspaceAccounts = await db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(eq(accounts.workspaceId, connection.workspaceId));

      const accountOptions: AccountOption[] = workspaceAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        normalizedName: normalize(a.name),
      }));

      for (const file of files) {
        const matched = matchAccountByFilename(file.name, accountOptions);
        if (!matched) {
          logger.info("No account matched filename — skipping", {
            fileName: file.name,
          });
          skipped += 1;
          continue;
        }

        const outcome = await importDriveFileForAccount({
          file,
          accessToken,
          workspaceId: connection.workspaceId,
          accountId: matched.id,
          uploadedByUserId: connection.connectedByUserId,
          source: "drive_sync",
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

// Preserve DriveFileMeta import usage for the worker bundler.
void ({} as DriveFileMeta | undefined);

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
