import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { driveConnections, accounts } from "@/lib/drizzle/schema";
import {
  ensureFreshAccessToken,
  listDriveFolderFiles,
} from "@/lib/google/drive";
import { importDriveFileForAccount } from "@/lib/google/drive-import";

interface SyncFolderInput {
  workspaceId: string;
  accountId: string;
  uploadedByUserId?: string | null;
  /**
   * When true, files imported during this run skip task extraction. The
   * UI sets this only on the initial bulk import (so historical docs
   * don't flood the task list). Cron + manual "Sync now" leave it
   * unset so future files extract tasks normally.
   */
  skipTaskExtraction?: boolean;
}

const MAX_FILES_PER_RUN = 24;

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

export const syncDriveFolderForAccount = task({
  id: "sync-drive-folder-for-account",
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: SyncFolderInput): Promise<void> => {
    const [acc] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        driveFolderId: accounts.driveFolderId,
        driveFolderName: accounts.driveFolderName,
        driveFolderMatchAccountName: accounts.driveFolderMatchAccountName,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, payload.accountId),
          eq(accounts.workspaceId, payload.workspaceId)
        )
      )
      .limit(1);

    if (!acc?.driveFolderId) {
      logger.info(
        "Account has no folder bound — nothing to sync, exiting cleanly",
        { accountId: payload.accountId }
      );
      return;
    }

    const [conn] = await db
      .select()
      .from(driveConnections)
      .where(eq(driveConnections.workspaceId, payload.workspaceId))
      .limit(1);
    if (!conn) {
      logger.warn("No Drive connection on workspace — skip", {
        workspaceId: payload.workspaceId,
      });
      return;
    }

    const accessToken = await ensureFreshAccessToken(conn.id);

    let files = await listDriveFolderFiles(accessToken, acc.driveFolderId, {
      limit: MAX_FILES_PER_RUN,
    });

    // Optional safety filter for shared folders: only import files whose
    // name mentions the account name. Case- and accent-insensitive `includes`
    // — same idiom used by the workspace-level matcher.
    if (acc.driveFolderMatchAccountName) {
      const normalizedAccount = normalize(acc.name);
      const before = files.length;
      files = files.filter((f) => normalize(f.name).includes(normalizedAccount));
      logger.info("Account-name filter applied to folder sync", {
        accountId: acc.id,
        before,
        after: files.length,
      });
    }

    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    for (const file of files) {
      try {
        const outcome = await importDriveFileForAccount({
          file,
          accessToken,
          workspaceId: payload.workspaceId,
          accountId: acc.id,
          uploadedByUserId: payload.uploadedByUserId ?? null,
          source: "drive_link",
          skipTaskExtraction: payload.skipTaskExtraction ?? false,
        });
        if (outcome === "imported") imported += 1;
        else if (outcome === "duplicate") duplicates += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        logger.warn("Failed to import file from account folder", {
          fileId: file.id,
          fileName: file.name,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await db
      .update(accounts)
      .set({
        driveFolderSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, acc.id));

    logger.info("Account folder sync done", {
      accountId: acc.id,
      folderName: acc.driveFolderName,
      total: files.length,
      imported,
      duplicates,
      skipped,
    });
  },
});

/**
 * Cron — every 10 min iterate every account that has a Drive folder bound
 * and trigger an incremental sync. Cron-driven syncs always extract tasks
 * (the skipTaskExtraction flag is only set on the initial bulk import via
 * the UI checkbox).
 */
export const syncAllAccountDriveFolders = schedules.task({
  id: "sync-all-account-drive-folders",
  cron: "*/10 * * * *",
  run: async (): Promise<void> => {
    const rows = await db
      .select({
        accountId: accounts.id,
        workspaceId: accounts.workspaceId,
      })
      .from(accounts)
      .where(
        and(
          isNotNull(accounts.driveFolderId),
          isNull(accounts.closedAt)
        )
      );

    for (const r of rows) {
      try {
        await syncDriveFolderForAccount.trigger({
          workspaceId: r.workspaceId,
          accountId: r.accountId,
        });
      } catch (err) {
        logger.warn("Failed to enqueue account folder sync", {
          accountId: r.accountId,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    logger.info("Account folder cron tick done", { accountsScanned: rows.length });
  },
});
