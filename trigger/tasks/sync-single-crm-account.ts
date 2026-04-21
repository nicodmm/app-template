// trigger/tasks/sync-single-crm-account.ts
import { task, logger } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { fetchAndUpsertCatalogs, fetchAndUpsertDeals } from "@/lib/crm/sync";

export const syncSingleCrmAccount = task({
  id: "sync-single-crm-account",
  retry: { maxAttempts: 3 },
  maxDuration: 300,
  run: async (payload: { connectionId: string }) => {
    const rows = await db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.id, payload.connectionId))
      .limit(1);
    if (rows.length === 0) return { skipped: "not_found" };
    const conn = rows[0];
    if (conn.status !== "active") return { skipped: conn.status };
    if (conn.catalogsConfiguredAt === null) return { skipped: "not_configured" };

    // Refresh catalogs if stale
    const staleHours = 24;
    const staleCutoff = new Date(Date.now() - staleHours * 3600_000);
    if (!conn.catalogsLastRefresh || conn.catalogsLastRefresh < staleCutoff) {
      await fetchAndUpsertCatalogs(conn.id);
    }

    const updatedSince = conn.lastSyncedAt
      ? new Date(conn.lastSyncedAt.getTime() - 5 * 60_000)  // 5-minute overlap
      : new Date(0);   // first incremental run pulls everything (mirrors backfill safety)

    const { upserted, deleted } = await fetchAndUpsertDeals(conn.id, updatedSince);

    await db
      .update(crmConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(crmConnections.id, conn.id));

    logger.info("incremental sync complete", { connectionId: conn.id, upserted, deleted });
    return { upserted, deleted };
  },
});
