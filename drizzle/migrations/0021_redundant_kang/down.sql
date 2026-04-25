-- Rollback for 0021_redundant_kang
ALTER TABLE "context_documents" DROP COLUMN IF EXISTS "ai_summary";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "agency_context";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "services";
