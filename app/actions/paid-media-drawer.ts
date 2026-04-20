"use server";

import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  getActiveAdsWithKpis,
  getChangeEventsForCampaign,
  getAssetVariantsForAd,
  type AdRow,
  type ChangeEventRow,
  type AssetVariantRow,
} from "@/lib/queries/paid-media";
import { db } from "@/lib/drizzle/db";
import { metaCampaigns, metaAdAccounts, metaAds } from "@/lib/drizzle/schema";
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

async function assertAdAccess(
  adId: string,
  workspaceId: string
): Promise<void> {
  const rows = await db
    .select({ id: metaAds.id })
    .from(metaAds)
    .innerJoin(
      metaAdAccounts,
      and(
        eq(metaAds.adAccountId, metaAdAccounts.id),
        eq(metaAdAccounts.workspaceId, workspaceId)
      )
    )
    .where(eq(metaAds.id, adId))
    .limit(1);

  if (rows.length === 0) throw new Error("forbidden");
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

export async function getAssetVariantsForAdAction(
  adId: string,
  since: string,
  until: string
): Promise<AssetVariantRow[]> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("no workspace");

  await assertAdAccess(adId, workspace.id);

  return getAssetVariantsForAd(adId, since, until);
}
