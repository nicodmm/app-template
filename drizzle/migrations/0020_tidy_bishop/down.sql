DROP INDEX IF EXISTS "tasks_context_document_idx";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_context_document_id_context_documents_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "context_document_id";
