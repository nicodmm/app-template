import { NextResponse, type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { db } from "@/lib/drizzle/db";
import { metaCampaigns, metaAdAccounts } from "@/lib/drizzle/schema";
import { getCampaignTrend } from "@/lib/queries/paid-media";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return NextResponse.json({ error: "no_workspace" }, { status: 401 });

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "missing_campaignId" }, { status: 400 });

  const rows = await db
    .select({ id: metaCampaigns.id })
    .from(metaCampaigns)
    .innerJoin(metaAdAccounts, eq(metaCampaigns.adAccountId, metaAdAccounts.id))
    .where(
      and(eq(metaCampaigns.id, campaignId), eq(metaAdAccounts.workspaceId, workspace.id))
    )
    .limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const trend = await getCampaignTrend(campaignId);
  return NextResponse.json({ trend });
}
