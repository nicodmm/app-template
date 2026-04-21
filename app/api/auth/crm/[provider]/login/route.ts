import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getProvider } from "@/lib/crm/provider";
import { signOAuthState } from "@/lib/crm/oauth";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { provider: providerId } = await params;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "missing accountId" }, { status: 400 });

  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return NextResponse.json({ error: "no workspace" }, { status: 403 });

  const acc = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (acc.length === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }

  const state = await signOAuthState({
    accountId,
    workspaceId: workspace.id,
    userId,
    provider: provider.id,
  });
  return NextResponse.redirect(provider.getAuthUrl(state));
}
