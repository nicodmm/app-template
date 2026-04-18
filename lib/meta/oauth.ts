import { env } from "@/lib/env";
import { metaGraphFetch } from "./client";

// ads_management is required to receive the full /activities feed.
// Without it, Meta's public API silently filters out auto-generated events
// (AD_REVIEW status transitions, recent system updates) that are otherwise
// visible in Business Manager's Activity Log.
const SCOPES = ["ads_read", "ads_management", "business_management"] as const;

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: env.META_OAUTH_REDIRECT_URI,
    state,
    scope: SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

export async function exchangeCodeForShortToken(code: string): Promise<TokenResponse> {
  return metaGraphFetch<TokenResponse>("/oauth/access_token", {
    accessToken: "",
    searchParams: {
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      redirect_uri: env.META_OAUTH_REDIRECT_URI,
      code,
    },
  });
}

export async function exchangeShortForLongToken(shortToken: string): Promise<TokenResponse> {
  return metaGraphFetch<TokenResponse>("/oauth/access_token", {
    accessToken: "",
    searchParams: {
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  });
}

export function tokenExpiryDate(tokenResp: TokenResponse): Date | null {
  if (!tokenResp.expires_in) return null;
  return new Date(Date.now() + tokenResp.expires_in * 1000);
}

export async function fetchMe(accessToken: string): Promise<{ id: string; name: string }> {
  return metaGraphFetch<{ id: string; name: string }>("/me", {
    accessToken,
    searchParams: { fields: "id,name" },
  });
}

export type MetaAdAccountFromApi = {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  business?: { id: string; name: string };
};

export async function fetchMyAdAccounts(accessToken: string): Promise<MetaAdAccountFromApi[]> {
  const result = await metaGraphFetch<{ data: MetaAdAccountFromApi[] }>("/me/adaccounts", {
    accessToken,
    searchParams: {
      fields: "id,account_id,name,currency,timezone_name,account_status,business",
      limit: 100,
    },
  });
  return result.data;
}
