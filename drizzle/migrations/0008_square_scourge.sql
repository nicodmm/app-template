CREATE TABLE "meta_ad_asset_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"ad_id" uuid NOT NULL,
	"meta_asset_hash" text NOT NULL,
	"name" text,
	"image_url" text,
	"thumbnail_url" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ad_asset_insights_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"asset_variant_id" uuid NOT NULL,
	"ad_id" uuid NOT NULL,
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
ALTER TABLE "meta_ad_asset_variants" ADD CONSTRAINT "meta_ad_asset_variants_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_asset_variants" ADD CONSTRAINT "meta_ad_asset_variants_ad_id_meta_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."meta_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_asset_insights_daily" ADD CONSTRAINT "meta_ad_asset_insights_daily_ad_account_id_meta_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."meta_ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_asset_insights_daily" ADD CONSTRAINT "meta_ad_asset_insights_daily_asset_variant_id_meta_ad_asset_variants_id_fk" FOREIGN KEY ("asset_variant_id") REFERENCES "public"."meta_ad_asset_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_asset_insights_daily" ADD CONSTRAINT "meta_ad_asset_insights_daily_ad_id_meta_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."meta_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_asset_variants_unique_idx" ON "meta_ad_asset_variants" USING btree ("ad_id","meta_asset_hash");--> statement-breakpoint
CREATE INDEX "meta_ad_asset_variants_ad_idx" ON "meta_ad_asset_variants" USING btree ("ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_asset_insights_daily_unique_idx" ON "meta_ad_asset_insights_daily" USING btree ("ad_account_id","asset_variant_id","date");--> statement-breakpoint
CREATE INDEX "meta_ad_asset_insights_daily_ad_date_idx" ON "meta_ad_asset_insights_daily" USING btree ("ad_id","date");