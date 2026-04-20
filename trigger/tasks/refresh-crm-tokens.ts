// trigger/tasks/refresh-crm-tokens.ts
import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { getProvider } from "@/lib/crm/provider";
import { CrmApiError } from "@/lib/crm/errors";

export const refreshCrmTokens = schedules.task({
  id: "refresh-crm-tokens",
  cron: "0 4 * * *",
  run: async () => {
    const cutoff = new Date(Date.now() + 6 * 3600_000);
    const rows = await db
      .select()
      .from(crmConnections)
      .where(and(eq(crmConnections.status, "active"), lte(crmConnections.tokenExpiresAt, cutoff)));

    logger.info(`refreshing ${rows.length} CRM tokens`);
    let refreshed = 0;
    let failed = 0;

    for (const c of rows) {
      try {
        const provider = getProvider(c.provider);
        const tokens = await provider.refreshToken(c.refreshToken);
        await db
          .update(crmConnections)
          .set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: tokens.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(crmConnections.id, c.id));
        refreshed++;
      } catch (err) {
        failed++;
        if (err instanceof CrmApiError && err.isAuthError()) {
          await db
            .update(crmConnections)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(crmConnections.id, c.id));
        }
        logger.error("CRM token refresh failed", {
          connectionId: c.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { refreshed, failed };
  },
});
