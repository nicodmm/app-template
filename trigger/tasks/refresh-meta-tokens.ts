import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaConnections } from "@/lib/drizzle/schema";
import { exchangeShortForLongToken, tokenExpiryDate } from "@/lib/meta/oauth";
import { MetaApiError } from "@/lib/meta/client";

export const refreshMetaTokens = schedules.task({
  id: "refresh-meta-tokens",
  cron: "0 3 * * *",
  run: async () => {
    const soon = new Date(Date.now() + 7 * 86400000);
    const rows = await db
      .select()
      .from(metaConnections)
      .where(
        and(
          eq(metaConnections.status, "active"),
          lte(metaConnections.tokenExpiresAt, soon)
        )
      );

    logger.info(`found ${rows.length} connections expiring within 7 days`);

    let refreshed = 0;
    let failed = 0;
    for (const c of rows) {
      try {
        const next = await exchangeShortForLongToken(c.accessToken);
        await db
          .update(metaConnections)
          .set({
            accessToken: next.access_token,
            tokenExpiresAt: tokenExpiryDate(next),
            updatedAt: new Date(),
          })
          .where(eq(metaConnections.id, c.id));
        refreshed++;
      } catch (err) {
        failed++;
        if (err instanceof MetaApiError && err.isAuthError()) {
          await db
            .update(metaConnections)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(metaConnections.id, c.id));
        }
        logger.error("token refresh failed", {
          connectionId: c.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { refreshed, failed };
  },
});
