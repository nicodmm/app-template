"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections, accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";

async function getWorkspaceAndOwner(
  userId: string
): Promise<{ workspaceId: string; isOwner: boolean }> {
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const member = await getWorkspaceMember(workspace.id, userId);
  return { workspaceId: workspace.id, isOwner: member?.role === "owner" };
}

/**
 * Carga la conexión y exige que el usuario sea su dueño o el owner del
 * workspace. Devuelve el workspaceId para reusar en revalidaciones.
 */
async function requireMetaConnectionAccess(
  connectionId: string,
  userId: string
): Promise<{ workspaceId: string }> {
  const { workspaceId, isOwner } = await getWorkspaceAndOwner(userId);
  const [conn] = await db
    .select({
      id: metaConnections.id,
      connectedByUserId: metaConnections.connectedByUserId,
    })
    .from(metaConnections)
    .where(
      and(
        eq(metaConnections.id, connectionId),
        eq(metaConnections.workspaceId, workspaceId)
      )
    )
    .limit(1);
  if (!conn) throw new Error("Conexión no encontrada");
  if (!isOwner && conn.connectedByUserId !== userId) {
    throw new Error("No tenés permisos sobre esta conexión");
  }
  return { workspaceId };
}

/**
 * Igual que el anterior pero resolviendo la conexión desde un ad account.
 */
async function requireAdAccountAccess(
  adAccountId: string,
  userId: string
): Promise<{ workspaceId: string }> {
  const { workspaceId, isOwner } = await getWorkspaceAndOwner(userId);
  const [ad] = await db
    .select({
      id: metaAdAccounts.id,
      connectedByUserId: metaConnections.connectedByUserId,
    })
    .from(metaAdAccounts)
    .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
    .where(
      and(
        eq(metaAdAccounts.id, adAccountId),
        eq(metaAdAccounts.workspaceId, workspaceId)
      )
    )
    .limit(1);
  if (!ad) throw new Error("Ad account no encontrado");
  if (!isOwner && ad.connectedByUserId !== userId) {
    throw new Error("No tenés permisos sobre este ad account");
  }
  return { workspaceId };
}

export async function disconnectMetaConnection(connectionId: string): Promise<void> {
  const userId = await requireUserId();
  await requireMetaConnectionAccess(connectionId, userId);
  await db.delete(metaConnections).where(eq(metaConnections.id, connectionId));
  revalidatePath("/app/settings/integrations");
}

export async function updateAdAccountMapping(input: {
  adAccountId: string;
  accountId: string | null;
  isEcommerce: boolean;
  conversionEvent: string;
}): Promise<{ triggeredBackfill: boolean }> {
  const userId = await requireUserId();
  const { workspaceId } = await requireAdAccountAccess(input.adAccountId, userId);

  const [adRow] = await db
    .select({ currentAccountId: metaAdAccounts.accountId })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, input.adAccountId))
    .limit(1);
  const previousAccountId = adRow?.currentAccountId ?? null;

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

  // workspaceId is available for future revalidations if needed
  void workspaceId;

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
  await requireAdAccountAccess(adAccountId, userId);
  const { tasks } = await import("@trigger.dev/sdk/v3");
  await tasks.trigger("backfill-meta-ads", { adAccountId });
}
