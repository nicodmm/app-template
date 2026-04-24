import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaAdAssetVariants,
  metaAdAccounts,
  metaConnections,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { resolveImageUrlsByHash } from "@/lib/meta/images";

function redirectWithCache(url: string): NextResponse {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "private, max-age=1800");
  return res;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
): Promise<NextResponse> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) {
    return NextResponse.json({ error: "no_workspace" }, { status: 401 });
  }

  const { variantId } = await params;

  const rows = await db
    .select({
      variant: metaAdAssetVariants,
      metaAdAccountId: metaAdAccounts.metaAdAccountId,
      accessToken: metaConnections.accessToken,
      connectionWorkspaceId: metaConnections.workspaceId,
    })
    .from(metaAdAssetVariants)
    .innerJoin(metaAdAccounts, eq(metaAdAccounts.id, metaAdAssetVariants.adAccountId))
    .innerJoin(metaConnections, eq(metaConnections.id, metaAdAccounts.connectionId))
    .where(eq(metaAdAssetVariants.id, variantId))
    .limit(1);

  const row = rows[0];
  if (!row || row.connectionWorkspaceId !== workspace.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const resolved = await resolveImageUrlsByHash(
      row.metaAdAccountId,
      row.accessToken,
      [row.variant.metaAssetHash]
    );
    const img = resolved.get(row.variant.metaAssetHash);
    const fresh = img?.url ?? img?.thumbnailUrl ?? null;
    if (fresh) return redirectWithCache(fresh);
  } catch {
    // fall through to stored URL
  }

  const fallback = row.variant.imageUrl ?? row.variant.thumbnailUrl ?? null;
  if (fallback) return redirectWithCache(fallback);
  return NextResponse.json({ error: "no_image" }, { status: 404 });
}
