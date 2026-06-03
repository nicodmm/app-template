import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client for server-only operations that bypass RLS,
 * e.g. private Storage uploads/signed URLs. NEVER import this in client code.
 */
export function createAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export const SELECTION_CV_BUCKET = "selection-cvs";
export const FINANCE_DOCS_BUCKET = "finance-docs";
