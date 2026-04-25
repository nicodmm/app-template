DROP INDEX IF EXISTS "context_documents_drive_file_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "transcripts_drive_file_idx";--> statement-breakpoint
ALTER TABLE "context_documents" DROP COLUMN IF EXISTS "google_drive_file_id";--> statement-breakpoint
ALTER TABLE "transcripts" DROP COLUMN IF EXISTS "google_drive_file_id";--> statement-breakpoint
DROP TABLE IF EXISTS "drive_connections";
