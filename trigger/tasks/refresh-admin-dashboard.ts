import { schedules, task, logger } from "@trigger.dev/sdk/v3";
import {
  computeAdminDashboardSnapshot,
  persistAdminDashboardSnapshot,
} from "@/lib/queries/admin-snapshot";

/**
 * On-demand entry point: triggered manually from the admin dashboard
 * "Refrescar ahora" button. Wraps the schedule's body so we have a
 * single id to fire.
 */
export const refreshAdminDashboardOnce = task({
  id: "refresh-admin-dashboard",
  retry: { maxAttempts: 2 },
  maxDuration: 120,
  run: async () => {
    logger.info("computing admin dashboard snapshot");
    const data = await computeAdminDashboardSnapshot();
    await persistAdminDashboardSnapshot(data);
    logger.info("admin dashboard snapshot persisted", {
      workspacesTotal: data.workspacesTotal,
      llmCostUsd30d: data.llmCostUsd30d,
    });
    return { ok: true };
  },
});

/**
 * Hourly schedule. Runs at minute 0 of every hour. Bumps to less-
 * frequent if the queries get heavy enough to justify, but currently
 * each refresh takes a few seconds even on a small workspace.
 */
export const refreshAdminDashboardCron = schedules.task({
  id: "refresh-admin-dashboard-cron",
  cron: "0 * * * *",
  run: async () => {
    const data = await computeAdminDashboardSnapshot();
    await persistAdminDashboardSnapshot(data);
    return { ok: true };
  },
});
