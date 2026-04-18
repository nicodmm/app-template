CREATE TABLE "meta_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connected_by_user_id" uuid,
	"meta_user_id" text NOT NULL,
	"meta_user_name" text,
	"access_token" text NOT NULL,
	"token_expires_at" timestamp,
	"scopes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid,
	"meta_ad_account_id" text NOT NULL,
	"meta_business_id" text,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"is_ecommerce" boolean DEFAULT false NOT NULL,
	"conversion_event" text DEFAULT 'lead' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"meta_campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"objective" text,
	"daily_budget" integer,
	"lifetime_budget" integer,
	"start_time" timestamp,
	"stop_time" timestamp,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_insights_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_id" uuid,
	"date" date NOT NULL,
	"spend" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"conversion_value" integer,
	"frequency" numeric(6, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insights_daily" ADD CONSTRAINT "meta_insights_daily_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insights_daily" ADD CONSTRAINT "meta_insights_daily_campaign_id_meta_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."meta_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_connections_workspace_idx" ON "meta_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "meta_connections_status_idx" ON "meta_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meta_ad_accounts_workspace_idx" ON "meta_ad_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "meta_ad_accounts_connection_idx" ON "meta_ad_accounts" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "meta_ad_accounts_account_idx" ON "meta_ad_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meta_ad_accounts_unique_idx" ON "meta_ad_accounts" USING btree ("connection_id","meta_ad_account_id");--> statement-breakpoint
CREATE INDEX "meta_campaigns_ad_account_idx" ON "meta_campaigns" USING btree ("ad_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_campaigns_unique_idx" ON "meta_campaigns" USING btree ("ad_account_id","meta_campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_insights_daily_unique_idx" ON "meta_insights_daily" USING btree ("ad_account_id","campaign_id","date");--> statement-breakpoint
CREATE INDEX "meta_insights_daily_ad_account_date_idx" ON "meta_insights_daily" USING btree ("ad_account_id","date");