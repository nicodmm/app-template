CREATE TABLE "meta_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"meta_ad_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"creative_id" text,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ad_insights_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"ad_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
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
CREATE TABLE "meta_change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_meta_id" text NOT NULL,
	"entity_local_id" uuid,
	"event_type" text NOT NULL,
	"event_data" jsonb NOT NULL,
	"raw_activity" jsonb NOT NULL,
	"parent_campaign_meta_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_change_events_entity_type_check" CHECK (entity_type IN ('campaign', 'ad_set', 'ad'))
);
--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_campaign_id_meta_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."meta_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_insights_daily" ADD CONSTRAINT "meta_ad_insights_daily_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_insights_daily" ADD CONSTRAINT "meta_ad_insights_daily_ad_id_meta_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."meta_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_insights_daily" ADD CONSTRAINT "meta_ad_insights_daily_campaign_id_meta_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."meta_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_change_events" ADD CONSTRAINT "meta_change_events_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_ads_campaign_idx" ON "meta_ads" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ads_unique_idx" ON "meta_ads" USING btree ("ad_account_id","meta_ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_insights_daily_unique_idx" ON "meta_ad_insights_daily" USING btree ("ad_account_id","ad_id","date");--> statement-breakpoint
CREATE INDEX "meta_ad_insights_daily_ad_account_date_idx" ON "meta_ad_insights_daily" USING btree ("ad_account_id","date");--> statement-breakpoint
CREATE INDEX "meta_ad_insights_daily_campaign_date_idx" ON "meta_ad_insights_daily" USING btree ("campaign_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_change_events_unique_idx" ON "meta_change_events" USING btree ("ad_account_id","entity_meta_id","event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "meta_change_events_timeline_idx" ON "meta_change_events" USING btree ("ad_account_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "meta_change_events_entity_idx" ON "meta_change_events" USING btree ("entity_type","entity_meta_id");--> statement-breakpoint
CREATE INDEX "meta_change_events_parent_campaign_idx" ON "meta_change_events" USING btree ("entity_type","parent_campaign_meta_id");
