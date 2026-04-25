import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { driveConnections } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  tokenExpiryDate,
} from "@/lib/google/oauth";

const STATE_COOKIE = "google_oauth_state";
const REDIRECT_BASE = `/app/settings/workspace`;

function redirect(reason: string, ok = false): NextResponse {
  const url = new URL(
    `${REDIRECT_BASE}?${ok ? "drive=" : "drive_error="}${encodeURIComponent(reason)}`,
    process.env.NEXT_PUBLIC_APP_URL
  );
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return redirect("no_workspace");
  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return redirect("forbidden");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) return redirect(oauthError);
  if (!code || !state) return redirect("missing_code");

  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  if (!storedState || storedState !== state) return redirect("invalid_state");

  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      // Without offline access we cannot refresh later.
      return redirect("no_refresh_token");
    }
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);

    // Upsert connection (workspace_id is unique).
    const existing = await db
      .select({ id: driveConnections.id })
      .from(driveConnections)
      .where(eq(driveConnections.workspaceId, workspace.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(driveConnections)
        .set({
          connectedByUserId: userId,
          googleAccountEmail: userInfo.email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: tokenExpiryDate(tokens),
          status: "connected",
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(driveConnections.id, existing[0].id));
    } else {
      await db.insert(driveConnections).values({
        workspaceId: workspace.id,
        connectedByUserId: userId,
        googleAccountEmail: userInfo.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokenExpiryDate(tokens),
        status: "connected",
      });
    }

    return redirect("connected", true);
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return redirect(message.substring(0, 80));
  }
}
