import { task, logger } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { driveConnections } from "@/lib/drizzle/schema";
import {
  ensureFreshAccessToken,
  type DriveFileMeta,
} from "@/lib/google/drive";
import { importDriveFileForAccount } from "@/lib/google/drive-import";

interface ImportDriveLinkInput {
  workspaceId: string;
  accountId: string;
  fileId: string;
  uploadedByUserId: string | null;
  userNotes: string | null;
  /**
   * Metadata we already resolved in the server action. If it's stale or
   * missing we re-fetch via the Drive API.
   */
  fileMeta?: DriveFileMeta;
}

export const importDriveLink = task({
  id: "import-drive-link",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 8000, factor: 2 },
  run: async (payload: ImportDriveLinkInput): Promise<void> => {
    const [connection] = await db
      .select()
      .from(driveConnections)
      .where(eq(driveConnections.workspaceId, payload.workspaceId))
      .limit(1);

    if (!connection) {
      logger.warn("No Drive connection for workspace — skipping link import", {
        workspaceId: payload.workspaceId,
      });
      return;
    }

    const accessToken = await ensureFreshAccessToken(connection.id);

    let fileMeta: DriveFileMeta | null = payload.fileMeta ?? null;
    if (!fileMeta) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${payload.fileId}?fields=id,name,mimeType,modifiedTime,size`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        logger.error("Drive metadata fetch failed in task", {
          fileId: payload.fileId,
          status: res.status,
        });
        return;
      }
      fileMeta = (await res.json()) as DriveFileMeta;
    }

    const outcome = await importDriveFileForAccount({
      file: fileMeta,
      accessToken,
      workspaceId: payload.workspaceId,
      accountId: payload.accountId,
      uploadedByUserId: payload.uploadedByUserId,
      userNotes: payload.userNotes,
      source: "drive_link",
    });

    logger.info("Drive link import finished", {
      fileId: payload.fileId,
      accountId: payload.accountId,
      outcome,
    });
  },
});
