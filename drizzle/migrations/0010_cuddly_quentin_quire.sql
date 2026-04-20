CREATE TABLE "crm_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_user_id" text NOT NULL,
	"external_company_id" text NOT NULL,
	"external_company_domain" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"scope" text,
	"catalogs_last_refresh" timestamp,
	"catalogs_configured_at" timestamp,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"is_synced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"order_nr" integer DEFAULT 0 NOT NULL,
	"is_synced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_source_config" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"source_field_type" text NOT NULL,
	"source_field_key" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"value" numeric(18, 2),
	"currency" text,
	"status" text NOT NULL,
	"pipeline_id" uuid,
	"stage_id" uuid,
	"source_external_id" text,
	"owner_name" text,
	"person_name" text,
	"org_name" text,
	"add_time" timestamp NOT NULL,
	"update_time" timestamp NOT NULL,
	"won_time" timestamp,
	"raw_data" jsonb,
	"last_synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_connections" ADD CONSTRAINT "crm_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_connections" ADD CONSTRAINT "crm_connections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_config" ADD CONSTRAINT "crm_source_config_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sources" ADD CONSTRAINT "crm_sources_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_id_crm_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_connections_account_provider_idx" ON "crm_connections" USING btree ("account_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipelines_unique_idx" ON "crm_pipelines" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_stages_unique_idx" ON "crm_stages" USING btree ("pipeline_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_sources_unique_idx" ON "crm_sources" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_deals_unique_idx" ON "crm_deals" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "crm_deals_account_addtime_idx" ON "crm_deals" USING btree ("account_id","add_time");--> statement-breakpoint
CREATE INDEX "crm_deals_account_status_idx" ON "crm_deals" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "crm_deals_connection_source_idx" ON "crm_deals" USING btree ("connection_id","source_external_id");