import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import type { CrmProviderId } from "./types";

const STATE_ALG = "HS256";
const STATE_EXPIRY = "10m";

export interface CrmOAuthState {
  accountId: string;
  workspaceId: string;
  userId: string;
  provider: CrmProviderId;
}

function getKey(): Uint8Array {
  return new TextEncoder().encode(env.CRM_STATE_SECRET);
}

export async function signOAuthState(state: CrmOAuthState): Promise<string> {
  return new SignJWT({ ...state })
    .setProtectedHeader({ alg: STATE_ALG })
    .setIssuedAt()
    .setExpirationTime(STATE_EXPIRY)
    .sign(getKey());
}

export async function verifyOAuthState(token: string): Promise<CrmOAuthState> {
  const { payload } = await jwtVerify(token, getKey(), { algorithms: [STATE_ALG] });
  const { accountId, workspaceId, userId, provider } = payload as Record<string, unknown>;
  if (
    typeof accountId !== "string" ||
    typeof workspaceId !== "string" ||
    typeof userId !== "string" ||
    typeof provider !== "string"
  ) {
    throw new Error("Invalid state payload");
  }
  const VALID_PROVIDERS: readonly CrmProviderId[] = [
    "pipedrive",
    "hubspot",
    "kommo",
    "dynamics",
  ];
  if (!VALID_PROVIDERS.includes(provider as CrmProviderId)) {
    throw new Error("Invalid state payload");
  }
  return { accountId, workspaceId, userId, provider: provider as CrmProviderId };
}
