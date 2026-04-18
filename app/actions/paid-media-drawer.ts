"use server";

import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  getActiveAdsWithKpis,
  getChangeEventsForCampaign,
  type AdRow,
  type ChangeEventRow,
} from "@/lib/queries/paid-media";
import { db } from "@/lib/drizzle/db";
import { metaCampaigns, metaAdAccounts } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";

async function assertCampaignAccess(
  campaignId: string,
  workspaceId: string
): Promise<{ adAccountId: string }> {
  const rows = await db
    .select({ adAccountId: metaCampaigns.adAccountId })
    .from(metaCampaigns)
    .innerJoin(
      metaAdAccounts,
      and(
        eq(metaCampaigns.adAccountId, metaAdAccounts.id),
        eq(metaAdAccounts.workspaceId, workspaceId)
      )
    )
    .where(eq(metaCampaigns.id, campaignId))
    .limit(1);

  if (rows.length === 0) throw new Error("forbidden");
  return { adAccountId: rows[0].adAccountId };
}

export async function getCampaignDrawerData(
  campaignId: string,
  since: string,
  until: string
): Promise<{ ads: AdRow[]; changes: ChangeEventRow[] }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("no workspace");

  const { adAccountId } = await assertCampaignAccess(campaignId, workspace.id);

  const [allAds, changes] = await Promise.all([
    getActiveAdsWithKpis(adAccountId, since, until),
    getChangeEventsForCampaign(campaignId, 20),
  ]);

  const ads = allAds.filter((a) => a.campaignId === campaignId);

  return { ads, changes };
}
