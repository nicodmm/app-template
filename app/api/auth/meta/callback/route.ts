import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaConnections, metaAdAccounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  exchangeCodeForShortToken,
  exchangeShortForLongToken,
  tokenExpiryDate,
  fetchMe,
  fetchMyAdAccounts,
} from "@/lib/meta/oauth";
import { MetaApiError } from "@/lib/meta/client";

const STATE_COOKIE = "meta_oauth_state";

function errorRedirect(reason: string): NextResponse {
  const url = new URL("/app/settings/integrations", process.env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return errorRedirect("no_workspace");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const metaError = req.nextUrl.searchParams.get("error");

  if (metaError) return errorRedirect(metaError);
  if (!code || !state) return errorRedirect("missing_code_or_state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  if (!storedState || storedState !== state) return errorRedirect("invalid_state");

  try {
    const shortToken = await exchangeCodeForShortToken(code);
    const longToken = await exchangeShortForLongToken(shortToken.access_token);
    const me = await fetchMe(longToken.access_token);

    const existing = await db
      .select()
      .from(metaConnections)
      .where(
        and(
          eq(metaConnections.workspaceId, workspace.id),
          eq(metaConnections.metaUserId, me.id)
        )
      )
      .limit(1);

    let connectionId: string;
    if (existing.length > 0) {
      connectionId = existing[0].id;
      await db
        .update(metaConnections)
        .set({
          accessToken: longToken.access_token,
          tokenExpiresAt: tokenExpiryDate(longToken),
          scopes: "ads_read,business_management",
          status: "active",
          connectedByUserId: userId,
          metaUserName: me.name,
          updatedAt: new Date(),
        })
        .where(eq(metaConnections.id, connectionId));
    } else {
      const inserted = await db
        .insert(metaConnections)
        .values({
          workspaceId: workspace.id,
          connectedByUserId: userId,
          metaUserId: me.id,
          metaUserName: me.name,
          accessToken: longToken.access_token,
          tokenExpiresAt: tokenExpiryDate(longToken),
          scopes: "ads_read,business_management",
          status: "active",
        })
        .returning({ id: metaConnections.id });
      connectionId = inserted[0].id;
    }

    const adAccounts = await fetchMyAdAccounts(longToken.access_token);
    for (const aa of adAccounts) {
      const existingAa = await db
        .select({ id: metaAdAccounts.id })
        .from(metaAdAccounts)
        .where(
          and(
            eq(metaAdAccounts.connectionId, connectionId),
            eq(metaAdAccounts.metaAdAccountId, aa.id)
          )
        )
        .limit(1);

      if (existingAa.length > 0) {
        await db
          .update(metaAdAccounts)
          .set({
            name: aa.name,
            currency: aa.currency,
            timezone: aa.timezone_name,
            status: aa.account_status,
            metaBusinessId: aa.business?.id ?? null,
            updatedAt: new Date(),
          })
          .where(eq(metaAdAccounts.id, existingAa[0].id));
      } else {
        await db.insert(metaAdAccounts).values({
          workspaceId: workspace.id,
          connectionId,
          metaAdAccountId: aa.id,
          metaBusinessId: aa.business?.id ?? null,
          name: aa.name,
          currency: aa.currency,
          timezone: aa.timezone_name,
          status: aa.account_status,
        });
      }
    }

    const url = new URL("/app/settings/integrations", process.env.NEXT_PUBLIC_APP_URL);
    url.searchParams.set("connected", "meta");
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof MetaApiError) return errorRedirect(`meta_${err.code}`);
    return errorRedirect("oauth_failed");
  }
}
