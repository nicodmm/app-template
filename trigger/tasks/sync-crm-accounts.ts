// trigger/tasks/sync-crm-accounts.ts
import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { syncSingleCrmAccount } from "./sync-single-crm-account";

export const syncCrmAccounts = schedules.task({
  id: "sync-crm-accounts",
  cron: "5 * * * *",
  run: async () => {
    const rows = await db
      .select({ id: crmConnections.id })
      .from(crmConnections)
      .where(
        and(
          eq(crmConnections.status, "active"),
          isNotNull(crmConnections.catalogsConfiguredAt)
        )
      );

    logger.info(`found ${rows.length} mapped CRM connections`);
    if (rows.length === 0) return { triggered: 0 };

    await syncSingleCrmAccount.batchTrigger(
      rows.map((r) => ({ payload: { connectionId: r.id } }))
    );
    return { triggered: rows.length };
  },
});
