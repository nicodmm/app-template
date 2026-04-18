"use server";

import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  getKpiDailyWithPrevious,
  getAdDailyWithPrevious,
  getCampaignDailyWithPrevious,
  type MetricKey,
  type DailyWithPrevious,
} from "@/lib/queries/paid-media";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaCampaigns } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";

async function assertAdAccountBelongsToWorkspace(
  adAccountId: string,
  workspaceId: string
): Promise<void> {
  const rows = await db
    .select({ id: metaAdAccounts.id })
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.id, adAccountId), eq(metaAdAccounts.workspaceId, workspaceId)))
    .limit(1);
  if (rows.length === 0) throw new Error("forbidden");
}

export async function getKpiChartData(
  adAccountId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("no workspace");
  await assertAdAccountBelongsToWorkspace(adAccountId, workspace.id);
  return getKpiDailyWithPrevious(adAccountId, since, until, metric);
}

export async function getAdChartData(
  adAccountId: string,
  adId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("no workspace");
  await assertAdAccountBelongsToWorkspace(adAccountId, workspace.id);
  return getAdDailyWithPrevious(adAccountId, adId, since, until, metric);
}

export async function getCampaignChartData(
  campaignId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("no workspace");

  // Resolve the campaign's ad account and verify ownership
  const rows = await db
    .select({ adAccountId: metaCampaigns.adAccountId })
    .from(metaCampaigns)
    .innerJoin(metaAdAccounts, eq(metaAdAccounts.id, metaCampaigns.adAccountId))
    .where(and(eq(metaCampaigns.id, campaignId), eq(metaAdAccounts.workspaceId, workspace.id)))
    .limit(1);
  if (rows.length === 0) throw new Error("forbidden");

  return getCampaignDailyWithPrevious(rows[0].adAccountId, campaignId, since, until, metric);
}
