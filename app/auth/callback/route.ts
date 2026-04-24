import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDefaultWorkspace, ensureUserRecord } from "@/app/actions/auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app/portfolio";
  const invite = searchParams.get("invite");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // With an invite token, skip creating a default workspace — the invite
      // accept page will add the user to the existing workspace.
      if (invite) {
        await ensureUserRecord(data.user.id, data.user.email ?? "");
      } else {
        await createDefaultWorkspace(data.user.id, data.user.email ?? "");
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`);
}
