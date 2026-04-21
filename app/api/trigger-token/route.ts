import { auth } from "@trigger.dev/sdk/v3";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const token = await auth.createPublicToken({
    scopes: {
      read: {
        runs: [runId],
      },
    },
    expirationTime: "1h",
  });

  return NextResponse.json({ token });
}
