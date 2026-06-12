import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
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
const RETURN_TO_COOKIE = "google_oauth_return_to";
const SCOPE_COOKIE = "google_oauth_drive_scope";
const DEFAULT_REDIRECT_BASE = `/app/settings/integrations`;

function redirect(
  reason: string,
  ok: boolean,
  returnTo: string | null
): NextResponse {
  const base = returnTo ?? DEFAULT_REDIRECT_BASE;
  const separator = base.includes("?") ? "&" : "?";
  const param = ok ? "drive=" : "drive_error=";
  const url = new URL(
    `${base}${separator}${param}${encodeURIComponent(reason)}`,
    process.env.NEXT_PUBLIC_APP_URL
  );
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId();

  // Pull the optional returnTo cookie up front so error redirects respect
  // it too. Only accept relative paths under /app/ — defense in depth.
  const cookieStore = await cookies();
  const rawReturn = cookieStore.get(RETURN_TO_COOKIE)?.value ?? null;
  const returnTo =
    rawReturn && rawReturn.startsWith("/app/") && !rawReturn.includes("//")
      ? rawReturn
      : null;
  if (rawReturn) cookieStore.delete(RETURN_TO_COOKIE);

  const requestedScope =
    cookieStore.get(SCOPE_COOKIE)?.value === "workspace" ? "workspace" : "personal";
  cookieStore.delete(SCOPE_COOKIE);

  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return redirect("no_workspace", false, returnTo);
  const member = await getWorkspaceMember(workspace.id, userId);
  const canManageWorkspaceScope =
    member?.role === "owner" || member?.role === "admin";
  const scope =
    requestedScope === "workspace" && canManageWorkspaceScope ? "workspace" : "personal";

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) return redirect(oauthError, false, returnTo);
  if (!code || !state) return redirect("missing_code", false, returnTo);

  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  if (!storedState || storedState !== state)
    return redirect("invalid_state", false, returnTo);

  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      // Without offline access we cannot refresh later.
      return redirect("no_refresh_token", false, returnTo);
    }
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);

    // Upsert connection keyed by (workspaceId, connectedByUserId, scope).
    const existing = await db
      .select({ id: driveConnections.id })
      .from(driveConnections)
      .where(
        and(
          eq(driveConnections.workspaceId, workspace.id),
          eq(driveConnections.connectedByUserId, userId),
          eq(driveConnections.scope, scope)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(driveConnections)
        .set({
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
        scope,
        googleAccountEmail: userInfo.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokenExpiryDate(tokens),
        status: "connected",
      });
    }

    return redirect("connected", true, returnTo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return redirect(message.substring(0, 80), false, returnTo);
  }
}
