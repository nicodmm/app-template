CREATE TABLE "account_finance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"razon_social" text,
	"cuit" text,
	"billing_email" text,
	"iva_condition" text,
	"lead_origin" text,
	"client_email" text,
	"client_responsible" text,
	"legal_rep_name" text,
	"legal_rep_dni" text,
	"legal_rep_email" text,
	"legal_address" text,
	"city" text,
	"country" text,
	"nda_storage_path" text,
	"nda_url" text,
	"nda_file_name" text,
	"nda_extracted_text" text,
	"nda_extraction_status" text DEFAULT 'none' NOT NULL,
	"nda_extraction_error" text,
	"nda_extracted_at" timestamp,
	"proposal_storage_path" text,
	"proposal_url" text,
	"proposal_file_name" text,
	"terms_raw_text" text,
	"terms_status" text DEFAULT 'none' NOT NULL,
	"terms_error" text,
	"terms_structured_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"neurona" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"billing_rule" text DEFAULT 'mep' NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_engagement_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	"fee" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_fee_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid,
	"consultant_name_raw" text,
	"share_type" text NOT NULL,
	"share_value" numeric(14, 2) NOT NULL,
	"share_currency" text,
	"applies_from" date,
	"applies_to" date,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_consultants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"neurona" text,
	"role_label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_compensation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"mep_rate" numeric(14, 4) NOT NULL,
	"ipc_coefficient" numeric(10, 4) DEFAULT '1',
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"engagement_id" uuid,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"concept" text NOT NULL,
	"amount_original" numeric(14, 2) NOT NULL,
	"currency_original" text NOT NULL,
	"amount_ars" numeric(14, 2),
	"fx_rate_used" numeric(14, 4),
	"ipc_used" numeric(10, 4),
	"status" text DEFAULT 'pending' NOT NULL,
	"billed_at" timestamp,
	"paid_at" timestamp,
	"is_additional" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "finance_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_finance" ADD CONSTRAINT "account_finance_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_finance" ADD CONSTRAINT "account_finance_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_engagements" ADD CONSTRAINT "finance_engagements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_engagements" ADD CONSTRAINT "finance_engagements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_engagement_periods" ADD CONSTRAINT "finance_engagement_periods_engagement_id_finance_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."finance_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_engagement_periods" ADD CONSTRAINT "finance_engagement_periods_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_engagement_periods" ADD CONSTRAINT "finance_engagement_periods_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_fee_shares" ADD CONSTRAINT "finance_fee_shares_engagement_id_finance_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."finance_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_fee_shares" ADD CONSTRAINT "finance_fee_shares_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_fee_shares" ADD CONSTRAINT "finance_fee_shares_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_fee_shares" ADD CONSTRAINT "finance_fee_shares_member_id_workspace_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_consultants" ADD CONSTRAINT "account_consultants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_consultants" ADD CONSTRAINT "account_consultants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_consultants" ADD CONSTRAINT "account_consultants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_compensation" ADD CONSTRAINT "member_compensation_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_compensation" ADD CONSTRAINT "member_compensation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_engagement_id_finance_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."finance_engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_finance_account_unique" ON "account_finance" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_finance_workspace_idx" ON "account_finance" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "finance_engagements_account_idx" ON "finance_engagements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "finance_engagements_workspace_idx" ON "finance_engagements" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "finance_engagements_account_status_idx" ON "finance_engagements" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "finance_engagement_periods_engagement_idx" ON "finance_engagement_periods" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "finance_engagement_periods_account_idx" ON "finance_engagement_periods" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "finance_fee_shares_engagement_idx" ON "finance_fee_shares" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "finance_fee_shares_member_idx" ON "finance_fee_shares" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "finance_fee_shares_account_idx" ON "finance_fee_shares" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_consultants_unique" ON "account_consultants" USING btree ("account_id","user_id","neurona");--> statement-breakpoint
CREATE INDEX "account_consultants_account_idx" ON "account_consultants" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "member_compensation_workspace_user_idx" ON "member_compensation" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_workspace_year_month_unique" ON "fx_rates" USING btree ("workspace_id","year","month");--> statement-breakpoint
CREATE INDEX "billing_records_workspace_period_idx" ON "billing_records" USING btree ("workspace_id","year","month");--> statement-breakpoint
CREATE INDEX "billing_records_account_period_idx" ON "billing_records" USING btree ("account_id","year","month");--> statement-breakpoint
CREATE INDEX "billing_records_workspace_status_idx" ON "billing_records" USING btree ("workspace_id","status");