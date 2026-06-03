import { schedules, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/drizzle/db";
import { workspaces } from "@/lib/drizzle/schema";
import { runMonthlyBilling } from "@/lib/finance/run-monthly-billing";

/**
 * Día 1 de cada mes (06:00 UTC): regenera la facturación del mes en curso para
 * todos los workspaces. Idempotente (preserva estados), así que correrlo de más
 * no rompe nada.
 */
export const generateMonthlyBilling = schedules.task({
  id: "generate-monthly-billing",
  cron: "0 6 1 * *",
  run: async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const rows = await db.select({ id: workspaces.id }).from(workspaces);

    let totalCreated = 0;
    let totalUpdated = 0;
    for (const ws of rows) {
      const { created, updated } = await runMonthlyBilling(ws.id, year, month);
      totalCreated += created;
      totalUpdated += updated;
    }

    logger.info("Monthly billing generated", {
      year,
      month,
      workspaces: rows.length,
      created: totalCreated,
      updated: totalUpdated,
    });

    return { created: totalCreated, updated: totalUpdated };
  },
});
