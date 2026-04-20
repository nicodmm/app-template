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
import { fetchAndUpsertAssetInsights } from "@/lib/meta/sync-asset-variants";
import { fetchAndUpsertChangeEvents, pruneOldChangeEvents } from "@/lib/meta/sync-changes";
import { MetaApiError } from "@/lib/meta/client";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface SyncSingleInput {
  adAccountId: string;
  customRange?: { since: string; until: string };
}

interface SyncResult {
  campaignInsightsUpserted: number;
  adInsightsUpserted: number;
  changeEventsUpserted: number;
}

export const syncSingleAdAccount = task({
  id: "sync-single-ad-account",
  retry: { maxAttempts: 3 },
  maxDuration: 600,
  run: async (payload: SyncSingleInput): Promise<SyncResult> => {
    const row = await getAdAccountWithConnection(payload.adAccountId);
    if (!row) throw new AbortTaskRunError("ad account not found");
    if (row.connectionStatus !== "active") {
      logger.warn("Skipping sync — connection not active", {
        adAccountId: payload.adAccountId,
        status: row.connectionStatus,
      });
      return { campaignInsightsUpserted: 0, adInsightsUpserted: 0, changeEventsUpserted: 0 };
    }

    const accessToken = row.accessToken;
    const metaId = row.adAccount.metaAdAccountId;

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

      const today = new Date();
      const range = payload.customRange ?? {
        since: isoDate(new Date(today.getTime() - 3 * 86400000)),
        until: isoDate(today),
      };

      const campaignInsightsUpserted = await fetchAndUpsertInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: range.since,
        until: range.until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        campaignIdMap: campaignMap,
      });

      const adInsightsUpserted = await fetchAndUpsertAdInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: range.since,
        until: range.until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        adIdMap: adMap,
        campaignIdMap: campaignMap,
      });

      await fetchAndUpsertAssetInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: range.since,
        until: range.until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        adIdMap: adMap,
      });

      // Change events: sync from last 25 hours to cover the hourly sync window
      // with overlap (idempotent via UNIQUE). On first sync this yields recent
      // events only; full 90-day backfill runs in backfill-meta-ads.
      const changeSince = new Date(Date.now() - 25 * 3600 * 1000);
      const changeEventsUpserted = await fetchAndUpsertChangeEvents({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: changeSince,
      });

      await pruneOldChangeEvents(payload.adAccountId);

      await db
        .update(metaAdAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(metaAdAccounts.id, payload.adAccountId));

      logger.info("sync complete", {
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
