DROP INDEX "drive_connections_workspace_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "drive_folder_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD COLUMN "scope" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "drive_connections_ws_user_scope_unique" ON "drive_connections" USING btree ("workspace_id","connected_by_user_id","scope");--> statement-breakpoint
ALTER TABLE "drive_connections" ADD CONSTRAINT "drive_connections_scope_check" CHECK ("drive_connections"."scope" IN ('personal','workspace'));