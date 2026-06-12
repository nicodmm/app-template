DROP INDEX IF EXISTS "drive_connections_ws_user_scope_unique";
ALTER TABLE "drive_connections" DROP CONSTRAINT IF EXISTS "drive_connections_scope_check";
ALTER TABLE "drive_connections" DROP COLUMN IF EXISTS "scope";
CREATE UNIQUE INDEX IF NOT EXISTS "drive_connections_workspace_unique" ON "drive_connections" ("workspace_id");
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "drive_folder_connection_id";
