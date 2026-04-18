import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireUserId } from "@/lib/auth";
import { buildAuthorizeUrl } from "@/lib/meta/oauth";

const STATE_COOKIE = "meta_oauth_state";
const STATE_TTL_SECONDS = 600;

export async function GET() {
  await requireUserId();

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  const url = buildAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
