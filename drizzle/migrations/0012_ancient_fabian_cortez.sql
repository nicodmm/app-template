ALTER TABLE "accounts" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "fee" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "enabled_modules" jsonb DEFAULT '{}'::jsonb NOT NULL;