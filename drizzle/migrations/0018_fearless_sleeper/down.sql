DROP INDEX IF EXISTS "context_documents_drive_file_unique_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "transcripts_drive_file_unique_idx";
--> statement-breakpoint

CREATE UNIQUE INDEX "transcripts_drive_file_unique_idx"
  ON "transcripts" ("google_drive_file_id")
  WHERE "google_drive_file_id" IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "context_documents_drive_file_unique_idx"
  ON "context_documents" ("google_drive_file_id")
  WHERE "google_drive_file_id" IS NOT NULL;
