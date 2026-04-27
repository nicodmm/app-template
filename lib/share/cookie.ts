import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET_NAME = "SHARE_LINK_SECRET";

interface SharePayload {
  token: string;
  passwordVersion: number;
  exp: number;
}

function getSecret(): string {
  const v = process.env[SECRET_NAME];
  if (!v) throw new Error(`${SECRET_NAME} not configured`);
  return v;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function encodeShareCookie(payload: SharePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function decodeShareCookie(cookie: string): SharePayload | null {
  const [body, sig] = cookie.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as SharePayload;
    if (decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function shareCookieName(token: string): string {
  return `share_${token}`;
}

export const SHARE_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
