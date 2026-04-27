import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireUserId } from "@/lib/auth";
import {
  buildGoogleAuthorizeUrl,
  isGoogleOAuthConfigured,
} from "@/lib/google/oauth";

const STATE_COOKIE = "google_oauth_state";
const RETURN_TO_COOKIE = "google_oauth_return_to";
const STATE_TTL_SECONDS = 600;

/**
 * Only accept relative paths under /app/ as returnTo. Anything else gets
 * silently dropped so we never bounce the user to an external host.
 */
function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/app/")) return null;
  if (raw.includes("//") || raw.includes("\\")) return null;
  return raw;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  await requireUserId();

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/workspace?drive_error=not_configured`
    );
  }

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  if (returnTo) {
    cookieStore.set(RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });
  } else {
    cookieStore.delete(RETURN_TO_COOKIE);
  }

  return NextResponse.redirect(buildGoogleAuthorizeUrl(state));
}
