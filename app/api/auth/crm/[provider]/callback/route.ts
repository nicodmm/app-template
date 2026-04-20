import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { env } from "@/lib/env";
import { getProvider } from "@/lib/crm/provider";
import { verifyOAuthState } from "@/lib/crm/oauth";
import { fetchAndUpsertCatalogs } from "@/lib/crm/sync";
import { CrmApiError } from "@/lib/crm/errors";

interface Params {
  params: Promise<{ provider: string }>;
}

function redirect(pathAndQuery: string) {
  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}${pathAndQuery}`);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { provider: providerId } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError === "access_denied") {
    return redirect(`/app/settings/integrations?error=denied`);
  }
  if (!code || !stateRaw) {
    return redirect(`/app/settings/integrations?error=invalid_state`);
  }

  let state;
  try {
    state = await verifyOAuthState(stateRaw);
  } catch {
    return redirect(`/app/settings/integrations?error=invalid_state`);
  }

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return redirect(`/app/settings/integrations?error=unknown_provider`);
  }

  let exchange;
  try {
    exchange = await provider.exchangeCode(code);
  } catch (err) {
    console.error("[crm-callback] exchange failed", err);
    return redirect(`/app/settings/integrations?error=exchange_failed`);
  }

  const domain = exchange.externalCompanyDomain
    ? `${exchange.externalCompanyDomain}.pipedrive.com`
    : null;

  // Upsert connection (one per account + provider)
  const existing = await db
    .select({ id: crmConnections.id })
    .from(crmConnections)
    .where(
      and(
        eq(crmConnections.accountId, state.accountId),
        eq(crmConnections.provider, provider.id)
      )
    )
    .limit(1);

  let connectionId: string;
  const values = {
    workspaceId: state.workspaceId,
    accountId: state.accountId,
    provider: provider.id,
    externalUserId: exchange.externalUserId,
    externalCompanyId: exchange.externalCompanyId,
    externalCompanyDomain: domain,
    accessToken: exchange.accessToken,
    refreshToken: exchange.refreshToken,
    tokenExpiresAt: exchange.expiresAt,
    status: "active",
    scope: exchange.scope,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(crmConnections)
      .set(values)
      .where(eq(crmConnections.id, existing[0].id));
    connectionId = existing[0].id;
  } else {
    const inserted = await db
      .insert(crmConnections)
      .values(values)
      .returning({ id: crmConnections.id });
    connectionId = inserted[0].id;
  }

  // Seed catalogs — best effort; if this fails we still redirect to setup and the user sees an error banner there
  try {
    await fetchAndUpsertCatalogs(connectionId);
  } catch (err) {
    if (err instanceof CrmApiError && err.isAuthError()) {
      await db
        .update(crmConnections)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(crmConnections.id, connectionId));
      return redirect(`/app/settings/integrations?error=scope_insufficient`);
    }
    console.error("[crm-callback] catalog seed failed", err);
    // continue — the mapping page will retry
  }

  return redirect(`/app/accounts/${state.accountId}/crm/setup`);
}
