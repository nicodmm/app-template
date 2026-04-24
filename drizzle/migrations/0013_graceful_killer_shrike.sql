ALTER TABLE "accounts" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "employee_count" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "company_description" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "enriched_at" timestamp;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "enrichment_status" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "enrichment_error" text;