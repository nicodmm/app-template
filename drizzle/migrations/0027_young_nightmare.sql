CREATE TABLE "account_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token" text NOT NULL,
	"password_hash" text,
	"password_version" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"share_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "client_summary" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "client_summary_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "meta_campaigns" ADD COLUMN "public_name" text;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD COLUMN "public_name" text;--> statement-breakpoint
ALTER TABLE "account_share_links" ADD CONSTRAINT "account_share_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_share_links_account_idx" ON "account_share_links" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_share_links_token_idx" ON "account_share_links" USING btree ("token");