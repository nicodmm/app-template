import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections } from "@/lib/drizzle/schema";
import {
  fetchAndUpsertCampaigns,
  fetchAndUpsertInsights,
  getAdAccountWithConnection,
} from "@/lib/meta/sync-insights";
import { fetchAndUpsertAds, fetchAndUpsertAdInsights } from "@/lib/meta/sync-ads";
import { fetchAndUpsertChangeEvents, pruneOldChangeEvents } from "@/lib/meta/sync-changes";
import { MetaApiError } from "@/lib/meta/client";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface BackfillInput {
  adAccountId: string;
}

interface BackfillResult {
  campaignInsightsUpserted: number;
  adInsightsUpserted: number;
  changeEventsUpserted: number;
}

export const backfillMetaAds = task({
  id: "backfill-meta-ads",
  retry: { maxAttempts: 2 },
  maxDuration: 900,
  run: async (payload: BackfillInput): Promise<BackfillResult> => {
    const row = await getAdAccountWithConnection(payload.adAccountId);
    if (!row) throw new AbortTaskRunError("ad account not found");
    if (row.connectionStatus !== "active") {
      logger.warn("Skipping backfill — connection not active", {
        adAccountId: payload.adAccountId,
        status: row.connectionStatus,
      });
      return { campaignInsightsUpserted: 0, adInsightsUpserted: 0, changeEventsUpserted: 0 };
    }

    const accessToken = row.accessToken;
    const metaId = row.adAccount.metaAdAccountId;

    const today = new Date();
    const since = isoDate(new Date(today.getTime() - 90 * 86400000));
    const until = isoDate(today);

    logger.info("starting backfill", {
      adAccountId: payload.adAccountId,
      since,
      until,
    });

    try {
      const campaignMap = await fetchAndUpsertCampaigns(
        payload.adAccountId,
        metaId,
        accessToken
      );

      const adMap = await fetchAndUpsertAds(
        payload.adAccountId,
        metaId,
        accessToken,
        campaignMap
      );

      const campaignInsightsUpserted = await fetchAndUpsertInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since,
        until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        campaignIdMap: campaignMap,
      });

      const adInsightsUpserted = await fetchAndUpsertAdInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since,
        until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        adIdMap: adMap,
        campaignIdMap: campaignMap,
      });

      // Change events: backfill the full 90-day window (idempotent via UNIQUE constraint).
      // Meta's account-wide /activities endpoint is incomplete, so we also iterate
      // per-campaign and per-ad to pick up events the account feed misses.
      const changeSince = new Date(Date.now() - 90 * 86400000);
      const changeEventsUpserted = await fetchAndUpsertChangeEvents({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: changeSince,
        campaignMetaIds: Array.from(campaignMap.keys()),
        adMetaIds: Array.from(adMap.keys()),
      });

      await pruneOldChangeEvents(payload.adAccountId);

      await db
        .update(metaAdAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(metaAdAccounts.id, payload.adAccountId));

      logger.info("backfill complete", {
        adAccountId: payload.adAccountId,
        campaignInsightsUpserted,
        adInsightsUpserted,
        changeEventsUpserted,
      });
      return { campaignInsightsUpserted, adInsightsUpserted, changeEventsUpserted };
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
