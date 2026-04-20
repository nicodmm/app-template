import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";

const STATE_ALG = "HS256";
const STATE_EXPIRY = "10m";

export interface CrmOAuthState {
  accountId: string;
  workspaceId: string;
  userId: string;
  provider: string;
  nonce: string;
}

function getKey(): Uint8Array {
  return new TextEncoder().encode(env.CRM_STATE_SECRET);
}

export async function signOAuthState(
  state: Omit<CrmOAuthState, "nonce">
): Promise<string> {
  return new SignJWT({ ...state, nonce: randomUUID() })
    .setProtectedHeader({ alg: STATE_ALG })
    .setIssuedAt()
    .setExpirationTime(STATE_EXPIRY)
    .sign(getKey());
}

export async function verifyOAuthState(token: string): Promise<CrmOAuthState> {
  const { payload } = await jwtVerify(token, getKey(), { algorithms: [STATE_ALG] });
  const { accountId, workspaceId, userId, provider, nonce } = payload as Record<
    string,
    unknown
  >;
  if (
    typeof accountId !== "string" ||
    typeof workspaceId !== "string" ||
    typeof userId !== "string" ||
    typeof provider !== "string" ||
    typeof nonce !== "string"
  ) {
    throw new Error("Invalid state payload");
  }
  return { accountId, workspaceId, userId, provider, nonce };
}
