ALTER TABLE "workspaces" ADD COLUMN "services" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "agency_context" text;--> statement-breakpoint
ALTER TABLE "context_documents" ADD COLUMN "ai_summary" text;--> statement-breakpoint

-- Seed existing workspaces with the previously-hardcoded service catalog so
-- existing accounts keep matching options when admins open the editor. New
-- workspaces created post-migration get the same defaults via the signup
-- flow (see app/actions/auth.ts).
UPDATE "workspaces"
SET "services" = '["Growth","Marketing","Sherpa","Reingeniera Comercial","AI","Black Opps","Seleccion","People"]'::jsonb
WHERE "services" = '[]'::jsonb;
