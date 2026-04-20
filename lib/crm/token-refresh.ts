import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections, type CrmConnection } from "@/lib/drizzle/schema";
import { getProvider } from "./provider";
import { CrmApiError } from "./errors";
import type { ConnectionContext } from "./types";

/**
 * Wrap any provider API call so that 401 → refresh → retry once.
 * Throws the original (or the refresh error) if retry also fails.
 */
export async function withRefresh<T>(
  connection: CrmConnection,
  fn: (ctx: ConnectionContext) => Promise<T>
): Promise<T> {
  const ctx: ConnectionContext = {
    accessToken: connection.accessToken,
    apiDomain: connection.externalCompanyDomain
      ? `${connection.externalCompanyDomain}.pipedrive.com`
      : "api.pipedrive.com",
  };

  try {
    return await fn(ctx);
  } catch (err) {
    if (!(err instanceof CrmApiError) || !err.isAuthError()) throw err;

    // Attempt refresh
    const provider = getProvider(connection.provider);
    let tokens;
    try {
      tokens = await provider.refreshToken(connection.refreshToken);
    } catch (refreshErr) {
      await db
        .update(crmConnections)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(crmConnections.id, connection.id));
      throw refreshErr;
    }

    await db
      .update(crmConnections)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(crmConnections.id, connection.id));

    const newCtx: ConnectionContext = { ...ctx, accessToken: tokens.accessToken };
    return await fn(newCtx);
  }
}

export async function getConnectionOrThrow(connectionId: string): Promise<CrmConnection> {
  const rows = await db
    .select()
    .from(crmConnections)
    .where(eq(crmConnections.id, connectionId))
    .limit(1);
  if (rows.length === 0) throw new Error("connection not found");
  return rows[0];
}
