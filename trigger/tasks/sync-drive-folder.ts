import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import crypto from "node:crypto";
import mammoth from "mammoth";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  driveConnections,
  transcripts,
  contextDocuments,
  accounts,
} from "@/lib/drizzle/schema";
import {
  ensureFreshAccessToken,
  listDriveFolderFiles,
  downloadDriveFileAsArrayBuffer,
  classifyDriveFile,
  type DriveFileMeta,
} from "@/lib/google/drive";

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

function hashContent(content: string): string {
  return crypto
    .createHash("sha256")
    .update(content.trim().replace(/\s+/g, " ").toLowerCase())
    .digest("hex");
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
  // Pick the longest match to avoid "Acme" matching "Acme Cohort" when both exist.
  return matches.sort((a, b) => b.normalizedName.length - a.normalizedName.length)[0];
}

async function extractTextFromBuffer(
  data: ArrayBuffer,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  const lower = fileName.toLowerCase();

  // Plain text formats
  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "text/csv" ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv")
  ) {
    return new TextDecoder().decode(data);
  }

  // DOCX via mammoth (works in node)
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(data),
    });
    return result.value;
  }

  // PDFs are not extracted server-side in v1 — they get stored as context docs
  // with metadata only. User can re-upload manually for transcript processing.
  return null;
}

export const syncDriveFolder = task({
  id: "sync-drive-folder",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 10000, factor: 2 },
  run: async (payload: SyncDriveFolderInput): Promise<{ imported: number; skipped: number }> => {
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
        const result = await processFile(file, accessToken, connection, accountOptions);
        if (result === "imported") imported += 1;
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

async function processFile(
  file: DriveFileMeta,
  accessToken: string,
  connection: typeof driveConnections.$inferSelect,
  accountOptions: AccountOption[]
): Promise<"imported" | "skipped"> {
  // Dedup: already imported as a transcript or context_document?
  const transcriptDup = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.googleDriveFileId, file.id))
    .limit(1);
  if (transcriptDup.length > 0) return "skipped";

  const contextDup = await db
    .select({ id: contextDocuments.id })
    .from(contextDocuments)
    .where(eq(contextDocuments.googleDriveFileId, file.id))
    .limit(1);
  if (contextDup.length > 0) return "skipped";

  const matched = matchAccountByFilename(file.name, accountOptions);
  if (!matched) {
    logger.info("No account matched filename — skipping", { fileName: file.name });
    return "skipped";
  }

  const shape = classifyDriveFile(file.name, file.mimeType);

  let downloaded: { data: ArrayBuffer; mimeType: string } | null = null;
  try {
    downloaded = await downloadDriveFileAsArrayBuffer(
      accessToken,
      file.id,
      file.mimeType
    );
  } catch (err) {
    logger.warn("Drive download failed — skipping", {
      fileId: file.id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return "skipped";
  }

  const text = shape.isTranscriptShaped
    ? await extractTextFromBuffer(downloaded.data, downloaded.mimeType, file.name)
    : null;

  const fileSize = downloaded.data.byteLength;

  if (shape.isTranscriptShaped && text && text.trim().split(/\s+/).length >= 10) {
    const wordCount = text.trim().split(/\s+/).length;
    const contentHash = hashContent(text);

    const [inserted] = await db
      .insert(transcripts)
      .values({
        accountId: matched.id,
        workspaceId: connection.workspaceId,
        uploadedBy: connection.connectedByUserId,
        fileName: file.name,
        sourceType: "drive",
        googleDriveFileId: file.id,
        content: text,
        contentHash,
        wordCount,
        status: "pending",
      })
      .returning({ id: transcripts.id });

    try {
      const { processTranscript } = await import(
        "@/trigger/workflows/process-transcript"
      );
      const run = await processTranscript.trigger({
        transcriptId: inserted.id,
        accountId: matched.id,
        workspaceId: connection.workspaceId,
        content: text,
      });
      await db
        .update(transcripts)
        .set({ triggerJobId: run.id })
        .where(eq(transcripts.id, inserted.id));
    } catch (err) {
      logger.error("Failed to enqueue process-transcript for Drive file", {
        fileName: file.name,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
    return "imported";
  }

  // Otherwise persist as a context_document (best-effort text extraction).
  const extractedText = text ?? null;
  await db.insert(contextDocuments).values({
    workspaceId: connection.workspaceId,
    accountId: matched.id,
    uploadedByUserId: connection.connectedByUserId,
    docType: shape.contextDocType,
    title: file.name,
    notes: `Importado automáticamente desde Google Drive.`,
    fileName: file.name,
    mimeType: downloaded.mimeType,
    fileSize,
    extractedText,
    googleDriveFileId: file.id,
  });

  // Refresh account summary so the new context lands in "Resumen de situación"
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("refresh-account-summary", {
      accountId: matched.id,
      workspaceId: connection.workspaceId,
    });
  } catch (err) {
    logger.warn("Failed to enqueue refresh-account-summary after Drive import", {
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  return "imported";
}

// Avoid unused imports warning — pulled by the explicit ensureFreshAccessToken call above.
void sql;

/**
 * Scheduled wrapper: run every 30 minutes against every connected drive.
 * Trigger.dev v3 schedules.task is the supported API for cron schedules.
 */
export const syncAllDriveFolders = schedules.task({
  id: "sync-all-drive-folders",
  cron: "*/30 * * * *",
  run: async (): Promise<void> => {
    const connected = await db
      .select({ id: driveConnections.id })
      .from(driveConnections)
      .where(
        and(
          eq(driveConnections.status, "connected"),
          // folderId IS NOT NULL
        )
      );

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
