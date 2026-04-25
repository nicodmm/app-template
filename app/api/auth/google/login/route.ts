import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireUserId } from "@/lib/auth";
import {
  buildGoogleAuthorizeUrl,
  isGoogleOAuthConfigured,
} from "@/lib/google/oauth";

const STATE_COOKIE = "google_oauth_state";
const STATE_TTL_SECONDS = 600;

export async function GET(): Promise<NextResponse> {
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

  return NextResponse.redirect(buildGoogleAuthorizeUrl(state));
}
