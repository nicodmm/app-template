import { env } from "@/lib/env";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export class GoogleOAuthNotConfiguredError extends Error {
  constructor() {
    super("Google OAuth is not configured (set GOOGLE_CLIENT_ID/SECRET/REDIRECT)");
    this.name = "GoogleOAuthNotConfiguredError";
  }
}

export interface GoogleOAuthCreds {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleOAuthCreds(): GoogleOAuthCreds {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_OAUTH_REDIRECT_URI
  ) {
    throw new GoogleOAuthNotConfiguredError();
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
  };
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const creds = getGoogleOAuthCreds();
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const creds = getGoogleOAuthCreds();
  const body = new URLSearchParams({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${detail}`);
  }
  return res.json();
}

export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const creds = getGoogleOAuthCreds();
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${detail}`);
  }
  return res.json();
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email?: boolean;
  name?: string;
}

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${res.status}`);
  }
  return res.json();
}

export function tokenExpiryDate(token: GoogleTokenResponse): Date {
  return new Date(Date.now() + token.expires_in * 1000 - 60_000); // 1-min safety buffer
}
