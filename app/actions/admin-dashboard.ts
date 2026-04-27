"use server";

import { requireAdminAccess } from "@/lib/auth";

export async function refreshAdminDashboardNow(): Promise<{
  success: true;
  runId: string;
} | {
  success: false;
  error: string;
}> {
  await requireAdminAccess();
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    const handle = await tasks.trigger("refresh-admin-dashboard", {});
    return { success: true, runId: handle.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Falló disparar el refresh",
    };
  }
}
