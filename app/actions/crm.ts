// app/actions/crm.ts
"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import {
  crmConnections,
  crmPipelines,
  crmStages,
  crmSourceConfig,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";

async function assertConnectionAccess(connectionId: string): Promise<{
  connection: { id: string; accountId: string; workspaceId: string };
}> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");

  const rows = await db
    .select({
      id: crmConnections.id,
      accountId: crmConnections.accountId,
      workspaceId: crmConnections.workspaceId,
    })
    .from(crmConnections)
    .where(
      and(eq(crmConnections.id, connectionId), eq(crmConnections.workspaceId, workspace.id))
    )
    .limit(1);
  if (rows.length === 0) throw new Error("forbidden");
  return { connection: rows[0] };
}

export async function updateCrmMapping(input: {
  connectionId: string;
  syncedPipelineIds: string[];    // local uuids
  syncedStageIds: string[];       // local uuids, subset of stages of synced pipelines
  sourceFieldType: "channel" | "custom";
  sourceFieldKey: string;
}): Promise<{ triggeredBackfill: boolean }> {
  const { connection } = await assertConnectionAccess(input.connectionId);

  // Update pipelines.is_synced
  const allPipelines = await db
    .select({ id: crmPipelines.id, externalId: crmPipelines.externalId })
    .from(crmPipelines)
    .where(eq(crmPipelines.connectionId, connection.id));

  for (const p of allPipelines) {
    await db
      .update(crmPipelines)
      .set({
        isSynced: input.syncedPipelineIds.includes(p.id),
        updatedAt: new Date(),
      })
      .where(eq(crmPipelines.id, p.id));
  }

  // Update stages.is_synced
  const allStages = await db
    .select({ id: crmStages.id, pipelineId: crmStages.pipelineId })
    .from(crmStages)
    .where(
      inArray(
        crmStages.pipelineId,
        allPipelines.map((p) => p.id)
      )
    );
  for (const s of allStages) {
    await db
      .update(crmStages)
      .set({
        isSynced: input.syncedStageIds.includes(s.id),
        updatedAt: new Date(),
      })
      .where(eq(crmStages.id, s.id));
  }

  // Upsert source config
  const existing = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connection.id))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(crmSourceConfig)
      .set({
        sourceFieldType: input.sourceFieldType,
        sourceFieldKey: input.sourceFieldKey,
        updatedAt: new Date(),
      })
      .where(eq(crmSourceConfig.connectionId, connection.id));
  } else {
    await db.insert(crmSourceConfig).values({
      connectionId: connection.id,
      sourceFieldType: input.sourceFieldType,
      sourceFieldKey: input.sourceFieldKey,
    });
  }

  await db
    .update(crmConnections)
    .set({ catalogsConfiguredAt: new Date(), updatedAt: new Date() })
    .where(eq(crmConnections.id, connection.id));

  revalidatePath("/app/settings/integrations");
  revalidatePath(`/app/accounts/${connection.accountId}`);
  revalidatePath(`/app/accounts/${connection.accountId}/crm`);
  revalidatePath(`/app/accounts/${connection.accountId}/crm/setup`);

  const { tasks } = await import("@trigger.dev/sdk/v3");
  const idempotencyKey = `backfill-crm:${connection.id}:${[...input.syncedPipelineIds].sort().join(",")}:${input.sourceFieldKey}`;
  await tasks.trigger(
    "backfill-crm-account",
    { connectionId: connection.id },
    { idempotencyKey, idempotencyKeyTTL: "1h" }
  );

  return { triggeredBackfill: true };
}

export async function disconnectCrmConnection(connectionId: string): Promise<void> {
  const { connection } = await assertConnectionAccess(connectionId);
  await db.delete(crmConnections).where(eq(crmConnections.id, connectionId));
  revalidatePath("/app/settings/integrations");
  revalidatePath(`/app/accounts/${connection.accountId}/crm`);
}
