CREATE TABLE "selection_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"position" text NOT NULL,
	"position_description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"razon_social" text,
	"cuit" text,
	"owner_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "selection_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"linkedin_url" text,
	"expected_salary" text,
	"current_salary" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"client_rating" integer DEFAULT 0 NOT NULL,
	"client_notes" text,
	"interview_modality" text,
	"interview_schedule" text,
	"offer_conditions" text,
	"rejection_reason" text,
	"feedback_at" timestamp,
	"cv_storage_path" text,
	"cv_url" text,
	"cv_file_name" text,
	"cv_mime_type" text,
	"cv_file_size" integer,
	"cv_extracted_text" text,
	"recruiter_notes" text,
	"report_content" text,
	"report_status" text DEFAULT 'none' NOT NULL,
	"report_error" text,
	"report_generated_at" timestamp,
	"report_edited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "selection_searches" ADD CONSTRAINT "selection_searches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_searches" ADD CONSTRAINT "selection_searches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_searches" ADD CONSTRAINT "selection_searches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_candidates" ADD CONSTRAINT "selection_candidates_search_id_selection_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."selection_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_candidates" ADD CONSTRAINT "selection_candidates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_candidates" ADD CONSTRAINT "selection_candidates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "selection_searches_account_idx" ON "selection_searches" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "selection_searches_workspace_idx" ON "selection_searches" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "selection_searches_account_status_idx" ON "selection_searches" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "selection_candidates_search_idx" ON "selection_candidates" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX "selection_candidates_account_idx" ON "selection_candidates" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "selection_candidates_account_status_idx" ON "selection_candidates" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "selection_candidates_search_status_idx" ON "selection_candidates" USING btree ("search_id","status");