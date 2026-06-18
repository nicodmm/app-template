CREATE TABLE "selection_search_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"token" text NOT NULL,
	"password_hash" text,
	"password_version" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "selection_search_share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "selection_searches" ADD COLUMN "confidential" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "selection_search_share_links" ADD CONSTRAINT "selection_search_share_links_search_id_selection_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."selection_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "selection_search_share_links_search_idx" ON "selection_search_share_links" USING btree ("search_id");