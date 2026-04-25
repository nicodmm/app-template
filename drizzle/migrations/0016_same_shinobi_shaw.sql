CREATE TABLE "drive_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connected_by_user_id" uuid,
	"google_account_email" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp,
	"folder_id" text,
	"folder_name" text,
	"status" text,
	"last_sync_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "google_drive_file_id" text;--> statement-breakpoint
ALTER TABLE "context_documents" ADD COLUMN "google_drive_file_id" text;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD CONSTRAINT "drive_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD CONSTRAINT "drive_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drive_connections_workspace_unique" ON "drive_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "transcripts_drive_file_idx" ON "transcripts" USING btree ("google_drive_file_id");--> statement-breakpoint
CREATE INDEX "context_documents_drive_file_idx" ON "context_documents" USING btree ("google_drive_file_id");