ALTER TABLE "accounts" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "drive_folder_name" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "drive_folder_synced_at" timestamp;