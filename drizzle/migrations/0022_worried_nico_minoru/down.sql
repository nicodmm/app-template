-- Rollback for 0022_worried_nico_minoru (dashboard closed_at)
DROP INDEX IF EXISTS "accounts_workspace_active_idx";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "closed_at";
