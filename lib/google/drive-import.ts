import crypto from "node:crypto";
import mammoth from "mammoth";
import { extractText as extractPdfText } from "unpdf";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { transcripts, contextDocuments } from "@/lib/drizzle/schema";
import {
  classifyDriveFile,
  downloadDriveFileAsArrayBuffer,
  type DriveFileMeta,
} from "./drive";

export { driveViewLinkForFile, parseDriveFileIdFromUrl } from "./drive-links";

export type ImportOutcome = "imported" | "skipped" | "duplicate";

interface ImportOptions {
  file: DriveFileMeta;
  accessToken: string;
  workspaceId: string;
  accountId: string;
  uploadedByUserId: string | null;
  /** user-supplied when importing one-off via paste link; ignored for auto sync */
  userNotes?: string | null;
  /** how the import is being triggered — shows up in context_documents.notes when empty */
  source?: "drive_sync" | "drive_link";
  /**
   * When true, skip downloading the file. We just persist a context_document
   * row with metadata + Drive link, no AI pipeline. Used by the workspace
   * "link-only sync" mode to keep storage minimal.
   */
  linkOnly?: boolean;
  /**
   * When true, the transcript path skips extract-tasks and the context-doc
   * path skips enqueueing analyze-context-document. Used by the initial
   * bulk import after Drive-folder bind so historical files don't produce
   * stale tasks.
   */
  skipTaskExtraction?: boolean;
}

function hashContent(content: string): string {
  return crypto
    .createHash("sha256")
    .update(content.trim().replace(/\s+/g, " ").toLowerCase())
    .digest("hex");
}

async function extractTextFromBuffer(
  data: ArrayBuffer,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  const lower = fileName.toLowerCase();
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
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return result.value;
  }
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    try {
      const { text } = await extractPdfText(new Uint8Array(data), {
        mergePages: true,
      });
      return text;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Shared per-file import logic. Used by the auto Drive sync (after matching
 * filename→account) and by the manual "paste Drive link" server action (where
 * the user picks the account explicitly).
 *
 * Behaviour:
 *   - Pre-dedups against existing googleDriveFileId on transcripts and
 *     context_documents. Returns "duplicate" if already imported.
 *   - Downloads the file once via Drive API.
 *   - Transcript-shaped files (txt / md / docx / Google Doc) go through the
 *     process-transcript pipeline; everything else becomes a context_document
 *     with metadata + best-effort text (no file bytes persisted).
 *   - Uses onConflictDoNothing on both inserts so concurrent imports are safe
 *     under the partial unique index on google_drive_file_id.
 */
export async function importDriveFileForAccount(
  opts: ImportOptions
): Promise<ImportOutcome> {
  const { file, accessToken, workspaceId, accountId, uploadedByUserId } = opts;

  // Fast-path dedup — avoid a download if we already have this file.
  const existingTranscript = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.googleDriveFileId, file.id))
    .limit(1);
  if (existingTranscript.length > 0) return "duplicate";

  const existingContext = await db
    .select({ id: contextDocuments.id })
    .from(contextDocuments)
    .where(eq(contextDocuments.googleDriveFileId, file.id))
    .limit(1);
  if (existingContext.length > 0) return "duplicate";

  const shape = classifyDriveFile(file.name, file.mimeType);

  // Link-only mode: persist as context_document with metadata + Drive link.
  // No download, no extraction, no AI pipeline. Skip transcript route entirely.
  if (opts.linkOnly) {
    const insert = await db
      .insert(contextDocuments)
      .values({
        workspaceId: opts.workspaceId,
        accountId: opts.accountId,
        uploadedByUserId: opts.uploadedByUserId,
        docType: shape.contextDocType,
        title: file.name,
        notes:
          opts.userNotes && opts.userNotes.trim().length > 0
            ? opts.userNotes.trim()
            : "Sincronizado desde Drive (solo link, sin descarga).",
        fileName: file.name,
        mimeType: file.mimeType,
        fileSize: file.size ? Number(file.size) : null,
        extractedText: null,
        googleDriveFileId: file.id,
      })
      .onConflictDoNothing({ target: contextDocuments.googleDriveFileId })
      .returning({ id: contextDocuments.id });
    if (insert.length === 0) return "duplicate";
    try {
      const { tasks } = await import("@trigger.dev/sdk/v3");
      await tasks.trigger("refresh-account-summary", {
        accountId: opts.accountId,
        workspaceId: opts.workspaceId,
      });
      // Link-only docs typically have no extracted text, so analyze will
      // skip them — but we still enqueue so any user notes get scanned.
      await tasks.trigger("analyze-context-document", {
        contextDocumentId: insert[0].id,
        accountId: opts.accountId,
        workspaceId: opts.workspaceId,
      });
    } catch {
      // best-effort
    }
    return "imported";
  }

  let downloaded: { data: ArrayBuffer; mimeType: string } | null = null;
  try {
    downloaded = await downloadDriveFileAsArrayBuffer(
      accessToken,
      file.id,
      file.mimeType
    );
  } catch {
    return "skipped";
  }

  const text = shape.isTranscriptShaped
    ? await extractTextFromBuffer(downloaded.data, downloaded.mimeType, file.name)
    : null;

  if (shape.isTranscriptShaped && text && text.trim().split(/\s+/).length >= 10) {
    const wordCount = text.trim().split(/\s+/).length;
    const contentHash = hashContent(text);

    const inserted = await db
      .insert(transcripts)
      .values({
        accountId,
        workspaceId,
        uploadedBy: uploadedByUserId,
        fileName: file.name,
        sourceType: opts.source === "drive_link" ? "drive_link" : "drive",
        googleDriveFileId: file.id,
        content: text,
        contentHash,
        wordCount,
        status: "pending",
      })
      .onConflictDoNothing({ target: transcripts.googleDriveFileId })
      .returning({ id: transcripts.id });

    if (inserted.length === 0) return "duplicate";

    try {
      const { processTranscript } = await import(
        "@/trigger/workflows/process-transcript"
      );
      const run = await processTranscript.trigger({
        transcriptId: inserted[0].id,
        accountId,
        workspaceId,
        content: text,
        skipTaskExtraction: opts.skipTaskExtraction ?? false,
      });
      await db
        .update(transcripts)
        .set({ triggerJobId: run.id })
        .where(eq(transcripts.id, inserted[0].id));
    } catch {
      // trigger is best-effort; the row stays in 'pending' and will be retried
    }
    return "imported";
  }

  const autoNote =
    opts.source === "drive_link"
      ? "Importado desde un link de Drive."
      : "Importado automáticamente desde Google Drive.";
  const notes =
    opts.userNotes && opts.userNotes.trim().length > 0
      ? opts.userNotes.trim()
      : autoNote;

  const contextInsert = await db
    .insert(contextDocuments)
    .values({
      workspaceId,
      accountId,
      uploadedByUserId,
      docType: shape.contextDocType,
      title: file.name,
      notes,
      fileName: file.name,
      mimeType: downloaded.mimeType,
      fileSize: downloaded.data.byteLength,
      extractedText: text ?? null,
      googleDriveFileId: file.id,
    })
    .onConflictDoNothing({ target: contextDocuments.googleDriveFileId })
    .returning({ id: contextDocuments.id });

  if (contextInsert.length === 0) return "duplicate";

  // Kick off an account-summary refresh and a per-doc task analysis. The
  // analyzer skips automatically if the doc has too little narrative text.
  // skipTaskExtraction skips analyze-context-document entirely — it's a
  // dedicated task-extraction step.
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("refresh-account-summary", {
      accountId,
      workspaceId,
    });
    if (!opts.skipTaskExtraction) {
      await tasks.trigger("analyze-context-document", {
        contextDocumentId: contextInsert[0].id,
        accountId,
        workspaceId,
      });
    }
  } catch {
    // best-effort; manual re-trigger available from the UI
  }

  return "imported";
}
