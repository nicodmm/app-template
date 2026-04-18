import { task, logger } from "@trigger.dev/sdk/v3";
import { syncSingleAdAccount } from "./sync-single-ad-account";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface BackfillInput {
  adAccountId: string;
  days?: number;
}

export const backfillMetaAds = task({
  id: "backfill-meta-ads",
  retry: { maxAttempts: 2 },
  maxDuration: 900,
  run: async (payload: BackfillInput) => {
    const days = payload.days ?? 90;
    const today = new Date();
    const since = isoDate(new Date(today.getTime() - days * 86400000));
    const until = isoDate(today);

    logger.info("starting backfill", { adAccountId: payload.adAccountId, since, until });

    const result = await syncSingleAdAccount.triggerAndWait({
      adAccountId: payload.adAccountId,
      customRange: { since, until },
    });
    if (!result.ok) throw new Error("backfill sync failed");
    return { insightsUpserted: result.output.campaignInsightsUpserted };
  },
});
