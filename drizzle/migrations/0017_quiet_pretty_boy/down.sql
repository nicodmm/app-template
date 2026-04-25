DROP INDEX IF EXISTS "context_documents_drive_file_unique_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "transcripts_drive_file_unique_idx";
--> statement-breakpoint

CREATE INDEX "transcripts_drive_file_idx"
  ON "transcripts" ("google_drive_file_id");
--> statement-breakpoint

CREATE INDEX "context_documents_drive_file_idx"
  ON "context_documents" ("google_drive_file_id");
