import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections } from "@/lib/drizzle/schema";
import { syncSingleAdAccount } from "./sync-single-ad-account";

export const syncMetaAds = schedules.task({
  id: "sync-meta-ads",
  cron: "5 * * * *",
  run: async () => {
    const rows = await db
      .select({ id: metaAdAccounts.id })
      .from(metaAdAccounts)
      .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
      .where(
        and(
          isNotNull(metaAdAccounts.accountId),
          eq(metaConnections.status, "active")
        )
      );

    logger.info(`found ${rows.length} mapped ad accounts to sync`);

    if (rows.length === 0) return { triggered: 0 };

    await syncSingleAdAccount.batchTrigger(
      rows.map((r) => ({ payload: { adAccountId: r.id } }))
    );

    return { triggered: rows.length };
  },
});
