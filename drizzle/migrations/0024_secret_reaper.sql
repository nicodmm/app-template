CREATE TABLE "admin_dashboard_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'global' NOT NULL,
	"workspaces_total" integer DEFAULT 0 NOT NULL,
	"workspaces_new_30d" integer DEFAULT 0 NOT NULL,
	"users_total" integer DEFAULT 0 NOT NULL,
	"users_new_30d" integer DEFAULT 0 NOT NULL,
	"accounts_active" integer DEFAULT 0 NOT NULL,
	"transcripts_completed_30d" integer DEFAULT 0 NOT NULL,
	"llm_cost_usd_30d" numeric(14, 6) DEFAULT '0' NOT NULL,
	"llm_tokens_total_30d" bigint DEFAULT 0 NOT NULL,
	"llm_cost_usd_lifetime" numeric(14, 6) DEFAULT '0' NOT NULL,
	"llm_tokens_lifetime" bigint DEFAULT 0 NOT NULL,
	"top_workspaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_by_task" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refreshed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_dashboard_snapshot_kind_unique" UNIQUE("kind")
);
