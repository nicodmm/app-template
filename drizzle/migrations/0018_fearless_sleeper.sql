-- Replace the partial unique indexes with non-partial ones so plain
-- ON CONFLICT (google_drive_file_id) matches the constraint. Postgres unique
-- indexes already treat NULLs as distinct, so manual uploads (which leave the
-- column NULL) are still unconstrained.

DROP INDEX IF EXISTS "transcripts_drive_file_unique_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "context_documents_drive_file_unique_idx";
--> statement-breakpoint

CREATE UNIQUE INDEX "transcripts_drive_file_unique_idx"
  ON "transcripts" ("google_drive_file_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "context_documents_drive_file_unique_idx"
  ON "context_documents" ("google_drive_file_id");
