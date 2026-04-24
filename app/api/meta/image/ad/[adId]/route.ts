import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaAds, metaAdAccounts, metaConnections } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { metaGraphFetch } from "@/lib/meta/client";

type CreativeApi = {
  thumbnail_url?: string;
  image_url?: string;
  object_story_spec?: {
    link_data?: {
      image_url?: string;
      child_attachments?: Array<{ image_url?: string }>;
    };
    video_data?: { image_url?: string };
    photo_data?: { url?: string };
  };
};

function pickCreativeUrl(creative: CreativeApi): string | null {
  return (
    creative.image_url ??
    creative.object_story_spec?.link_data?.image_url ??
    creative.object_story_spec?.link_data?.child_attachments?.[0]?.image_url ??
    creative.object_story_spec?.video_data?.image_url ??
    creative.object_story_spec?.photo_data?.url ??
    creative.thumbnail_url ??
    null
  );
}

function redirectWithCache(url: string): NextResponse {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "private, max-age=1800");
  return res;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ adId: string }> }
): Promise<NextResponse> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) {
    return NextResponse.json({ error: "no_workspace" }, { status: 401 });
  }

  const { adId } = await params;

  const rows = await db
    .select({
      ad: metaAds,
      accessToken: metaConnections.accessToken,
      connectionWorkspaceId: metaConnections.workspaceId,
    })
    .from(metaAds)
    .innerJoin(metaAdAccounts, eq(metaAdAccounts.id, metaAds.adAccountId))
    .innerJoin(metaConnections, eq(metaConnections.id, metaAdAccounts.connectionId))
    .where(eq(metaAds.id, adId))
    .limit(1);

  const row = rows[0];
  if (!row || row.connectionWorkspaceId !== workspace.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const fallback = row.ad.imageUrl ?? row.ad.thumbnailUrl ?? null;

  if (row.ad.creativeId) {
    try {
      const creative = await metaGraphFetch<CreativeApi>(`/${row.ad.creativeId}`, {
        accessToken: row.accessToken,
        searchParams: {
          fields:
            "thumbnail_url,image_url,object_story_spec{link_data{image_url,child_attachments{image_url}},video_data{image_url},photo_data{url}}",
        },
      });

      const fresh = pickCreativeUrl(creative);
      if (fresh) return redirectWithCache(fresh);
    } catch {
      // fall through to stored URL
    }
  }

  if (fallback) return redirectWithCache(fallback);
  return NextResponse.json({ error: "no_image" }, { status: 404 });
}
