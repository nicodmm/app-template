"use server";

import { db } from "@/lib/drizzle/db";
import { signals } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { revalidatePath } from "next/cache";

async function getWorkspaceOrFail(userId: string) {
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  return workspace;
}

export async function resolveSignal(signalId: string, accountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .update(signals)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}

export async function reopenSignal(signalId: string, accountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .update(signals)
    .set({
      status: "active",
      resolvedAt: null,
      resolvedBy: null,
      updatedAt: new Date(),
    })
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}

export async function deleteSignal(signalId: string, accountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .delete(signals)
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}
