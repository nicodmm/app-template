// trigger/tasks/backfill-crm-account.ts
import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import {
  fetchAndUpsertCatalogs,
  fetchAndUpsertDeals,
  BACKFILL_WINDOW_MONTHS,
} from "@/lib/crm/sync";

export const backfillCrmAccount = task({
  id: "backfill-crm-account",
  retry: { maxAttempts: 2 },
  maxDuration: 1800,
  run: async (payload: { connectionId: string }) => {
    const rows = await db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.id, payload.connectionId))
      .limit(1);
    if (rows.length === 0) throw new AbortTaskRunError("connection not found");
    const connection = rows[0];
    if (connection.status !== "active") {
      logger.warn("skipping backfill — connection not active", {
        connectionId: connection.id,
        status: connection.status,
      });
      return { upserted: 0, deleted: 0, skipped: true };
    }

    await fetchAndUpsertCatalogs(connection.id);
    const addedSince = new Date();
    addedSince.setMonth(addedSince.getMonth() - BACKFILL_WINDOW_MONTHS);
    logger.info("backfill window", {
      connectionId: connection.id,
      addedSince: addedSince.toISOString(),
      months: BACKFILL_WINDOW_MONTHS,
    });
    const { upserted, deleted } = await fetchAndUpsertDeals(connection.id, null, addedSince);

    await db
      .update(crmConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(crmConnections.id, connection.id));

    logger.info("backfill complete", { connectionId: connection.id, upserted, deleted });
    return { upserted, deleted, skipped: false };
  },
});
