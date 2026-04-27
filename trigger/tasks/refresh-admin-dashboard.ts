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
  retry: { maxAttempts: 1 },
  maxDuration: 600,
  run: async () => {
    logger.info("computing admin dashboard snapshot");
    const t0 = Date.now();
    const data = await computeAdminDashboardSnapshot();
    logger.info("snapshot computed, persisting", {
      computeMs: Date.now() - t0,
      workspacesTotal: data.workspacesTotal,
    });
    await persistAdminDashboardSnapshot(data);
    logger.info("admin dashboard snapshot persisted", {
      totalMs: Date.now() - t0,
      workspacesTotal: data.workspacesTotal,
      llmCostUsd30d: data.llmCostUsd30d,
    });
    return { ok: true };
  },
});

/**
 * Hourly schedule. Runs at minute 0 of every hour.
 */
export const refreshAdminDashboardCron = schedules.task({
  id: "refresh-admin-dashboard-cron",
  cron: "0 * * * *",
  maxDuration: 600,
  run: async () => {
    const t0 = Date.now();
    const data = await computeAdminDashboardSnapshot();
    await persistAdminDashboardSnapshot(data);
    logger.info("admin dashboard snapshot persisted (cron)", {
      totalMs: Date.now() - t0,
      workspacesTotal: data.workspacesTotal,
    });
    return { ok: true };
  },
});
