CREATE TABLE "context_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"doc_type" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"file_name" text,
	"mime_type" text,
	"file_size" integer,
	"extracted_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "context_documents" ADD CONSTRAINT "context_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_documents" ADD CONSTRAINT "context_documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_documents" ADD CONSTRAINT "context_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_documents_account_idx" ON "context_documents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "context_documents_workspace_idx" ON "context_documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "context_documents_account_created_idx" ON "context_documents" USING btree ("account_id","created_at");