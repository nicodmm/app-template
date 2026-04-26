"use server";

import { requireUserId } from "@/lib/auth";
import {
  getWorkspaceByUserId,
  getWorkspaceMember,
} from "@/lib/queries/workspace";
import {
  getDashboardMetricBreakdown,
  type DashboardBreakdown,
  type DashboardMetricKey,
  type DashboardPeriod,
} from "@/lib/queries/dashboard";

export async function fetchDashboardBreakdown(
  metric: DashboardMetricKey,
  period: DashboardPeriod
): Promise<DashboardBreakdown> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Sin workspace");
  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member) throw new Error("Sin membresía en el workspace");

  return getDashboardMetricBreakdown(
    { workspaceId: workspace.id, userId, role: member.role },
    period,
    metric
  );
}
