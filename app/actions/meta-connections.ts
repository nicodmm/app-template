"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections, accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";

async function getWorkspaceOrFail(userId: string) {
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  return workspace;
}

export async function disconnectMetaConnection(connectionId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .delete(metaConnections)
    .where(
      and(
        eq(metaConnections.id, connectionId),
        eq(metaConnections.workspaceId, workspace.id)
      )
    );
  revalidatePath("/app/settings/integrations");
}

export async function updateAdAccountMapping(input: {
  adAccountId: string;
  accountId: string | null;
  isEcommerce: boolean;
  conversionEvent: string;
}): Promise<{ triggeredBackfill: boolean }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);

  const ad = await db
    .select({ id: metaAdAccounts.id, currentAccountId: metaAdAccounts.accountId })
    .from(metaAdAccounts)
    .where(
      and(
        eq(metaAdAccounts.id, input.adAccountId),
        eq(metaAdAccounts.workspaceId, workspace.id)
      )
    )
    .limit(1);
  if (ad.length === 0) throw new Error("Ad account no encontrado");

  const previousAccountId = ad[0].currentAccountId;
  const isNowMapped = input.accountId !== null;
  const accountChanged = previousAccountId !== input.accountId;
  const shouldBackfill = isNowMapped && accountChanged;

  await db
    .update(metaAdAccounts)
    .set({
      accountId: input.accountId,
      isEcommerce: input.isEcommerce,
      conversionEvent: input.conversionEvent,
      updatedAt: new Date(),
    })
    .where(eq(metaAdAccounts.id, input.adAccountId));

  if (input.accountId) {
    await db
      .update(accounts)
      .set({ hasAdConnections: true, updatedAt: new Date() })
      .where(eq(accounts.id, input.accountId));
  }

  revalidatePath("/app/settings/integrations");
  if (input.accountId) revalidatePath(`/app/accounts/${input.accountId}`);

  if (shouldBackfill) {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger(
      "backfill-meta-ads",
      { adAccountId: input.adAccountId },
      { idempotencyKey: `backfill:${input.adAccountId}:${input.accountId}`, idempotencyKeyTTL: "1h" }
    );
  }

  return { triggeredBackfill: shouldBackfill };
}

export async function triggerBackfillForAdAccount(adAccountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);

  const ad = await db
    .select({ id: metaAdAccounts.id })
    .from(metaAdAccounts)
    .where(
      and(
        eq(metaAdAccounts.id, adAccountId),
        eq(metaAdAccounts.workspaceId, workspace.id)
      )
    )
    .limit(1);
  if (ad.length === 0) throw new Error("Ad account no encontrado");

  const { tasks } = await import("@trigger.dev/sdk/v3");
  await tasks.trigger("backfill-meta-ads", { adAccountId });
}
