CREATE TABLE "account_billing_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"billed_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_billing_status_account_period_unique" UNIQUE("account_id","year","month")
);
--> statement-breakpoint
ALTER TABLE "billing_records" ADD COLUMN "centro_costos" text;--> statement-breakpoint
ALTER TABLE "account_billing_status" ADD CONSTRAINT "account_billing_status_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_billing_status" ADD CONSTRAINT "account_billing_status_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_billing_status_workspace_period_idx" ON "account_billing_status" USING btree ("workspace_id","year","month");