CREATE TABLE "finance_projection_assumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"breakeven_usd" numeric(14, 2) DEFAULT '0' NOT NULL,
	"otros_ingresos_usd" numeric(14, 2) DEFAULT '0' NOT NULL,
	"clientes_nuevos_mes" integer DEFAULT 0 NOT NULL,
	"ticket_medio_nuevo_usd" numeric(14, 2) DEFAULT '0' NOT NULL,
	"churn_usd_mes" numeric(14, 2) DEFAULT '0' NOT NULL,
	"horizonte_meses" integer DEFAULT 6 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_projection_assumptions_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "finance_projection_assumptions" ADD CONSTRAINT "finance_projection_assumptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_projection_assumptions" ADD CONSTRAINT "finance_projection_assumptions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;