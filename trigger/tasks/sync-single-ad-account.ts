import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections } from "@/lib/drizzle/schema";
import {
  fetchAndUpsertCampaigns,
  fetchAndUpsertInsights,
  getAdAccountWithConnection,
} from "@/lib/meta/sync-insights";
import { MetaApiError } from "@/lib/meta/client";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface SyncSingleInput {
  adAccountId: string;
  customRange?: { since: string; until: string };
}

export const syncSingleAdAccount = task({
  id: "sync-single-ad-account",
  retry: { maxAttempts: 3 },
  maxDuration: 300,
  run: async (payload: SyncSingleInput): Promise<{ insightsUpserted: number }> => {
    const row = await getAdAccountWithConnection(payload.adAccountId);
    if (!row) throw new AbortTaskRunError("ad account not found");
    if (row.connectionStatus !== "active") {
      logger.warn("Skipping sync — connection not active", {
        adAccountId: payload.adAccountId,
        status: row.connectionStatus,
      });
      return { insightsUpserted: 0 };
    }

    const accessToken = row.accessToken;
    const metaId = row.adAccount.metaAdAccountId;

    try {
      const campaignMap = await fetchAndUpsertCampaigns(
        payload.adAccountId,
        metaId,
        accessToken
      );

      const today = new Date();
      const range = payload.customRange ?? {
        since: isoDate(new Date(today.getTime() - 3 * 86400000)),
        until: isoDate(today),
      };

      const upserts = await fetchAndUpsertInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: range.since,
        until: range.until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        campaignIdMap: campaignMap,
      });

      await db
        .update(metaAdAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(metaAdAccounts.id, payload.adAccountId));

      logger.info("sync complete", { adAccountId: payload.adAccountId, upserts });
      return { insightsUpserted: upserts };
    } catch (err) {
      if (err instanceof MetaApiError && err.isAuthError()) {
        logger.error("token expired/revoked — marking connection expired", {
          adAccountId: payload.adAccountId,
        });
        await db
          .update(metaConnections)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(metaConnections.id, row.adAccount.connectionId));
        throw new AbortTaskRunError("meta_auth_error");
      }
      if (err instanceof MetaApiError && err.isRateLimit()) {
        logger.warn("rate limited — will retry", { code: err.code });
      }
      throw err;
    }
  },
});
