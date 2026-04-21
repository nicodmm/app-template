import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  crmConnections,
  crmPipelines,
  crmStages,
  crmDeals,
  crmSources,
  crmSourceConfig,
  accounts,
} from "@/lib/drizzle/schema";
import { getProvider } from "./provider";
import { getConnectionOrThrow, withRefresh } from "./token-refresh";

/**
 * Refresh pipelines + stages (preserving is_synced). If source_config exists,
 * also refresh crm_sources catalog.
 */
export async function fetchAndUpsertCatalogs(connectionId: string): Promise<void> {
  const connection = await getConnectionOrThrow(connectionId);
  const provider = getProvider(connection.provider);

  const pipelines = await withRefresh(connection, (ctx) => provider.fetchPipelines(ctx));

  // Load existing pipelines to preserve is_synced
  const existingPipelines = await db
    .select({ id: crmPipelines.id, externalId: crmPipelines.externalId, isSynced: crmPipelines.isSynced })
    .from(crmPipelines)
    .where(eq(crmPipelines.connectionId, connectionId));
  const pipelineByExternal = new Map(existingPipelines.map((p) => [p.externalId, p]));

  const pipelineLocalIds = new Map<string, string>(); // externalId -> local uuid

  for (const p of pipelines) {
    const existing = pipelineByExternal.get(p.externalId);
    if (existing) {
      await db
        .update(crmPipelines)
        .set({ name: p.name, updatedAt: new Date() })
        .where(eq(crmPipelines.id, existing.id));
      pipelineLocalIds.set(p.externalId, existing.id);
    } else {
      const inserted = await db
        .insert(crmPipelines)
        .values({ connectionId, externalId: p.externalId, name: p.name, isSynced: false })
        .returning({ id: crmPipelines.id });
      pipelineLocalIds.set(p.externalId, inserted[0].id);
    }
  }

  // Stages (per pipeline)
  for (const [externalId, localId] of pipelineLocalIds.entries()) {
    const stages = await withRefresh(connection, (ctx) =>
      provider.fetchStages(ctx, externalId)
    );
    const existingStages = await db
      .select({ id: crmStages.id, externalId: crmStages.externalId })
      .from(crmStages)
      .where(eq(crmStages.pipelineId, localId));
    const stageByExternal = new Map(existingStages.map((s) => [s.externalId, s]));

    for (const s of stages) {
      const existing = stageByExternal.get(s.externalId);
      if (existing) {
        await db
          .update(crmStages)
          .set({ name: s.name, orderNr: s.orderNr, updatedAt: new Date() })
          .where(eq(crmStages.id, existing.id));
      } else {
        await db
          .insert(crmStages)
          .values({
            pipelineId: localId,
            externalId: s.externalId,
            name: s.name,
            orderNr: s.orderNr,
            isSynced: false,
          });
      }
    }
  }

  // Sources catalog (only if source_config exists)
  const srcCfg = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connectionId))
    .limit(1);
  if (srcCfg.length > 0) {
    const cfg = srcCfg[0];
    const sourceValues = await withRefresh(connection, (ctx) =>
      provider.fetchSourceCatalog(
        ctx,
        cfg.sourceFieldType as "channel" | "custom",
        cfg.sourceFieldKey
      )
    );
    // Wipe + replace — catalog is small and changes are rare
    await db.delete(crmSources).where(eq(crmSources.connectionId, connectionId));
    if (sourceValues.length > 0) {
      await db.insert(crmSources).values(
        sourceValues.map((v) => ({
          connectionId,
          externalId: v.externalId,
          name: v.name,
        }))
      );
    }
  }

  await db
    .update(crmConnections)
    .set({ catalogsLastRefresh: new Date(), updatedAt: new Date() })
    .where(eq(crmConnections.id, connectionId));
}

/**
 * Fetch and upsert deals. If updatedSince is provided, also runs lost-deletion cleanup.
 */
export const BACKFILL_WINDOW_MONTHS = 12;

export async function fetchAndUpsertDeals(
  connectionId: string,
  updatedSince: Date | null,
  addedSince: Date | null = null
): Promise<{ upserted: number; deleted: number }> {
  const connection = await getConnectionOrThrow(connectionId);
  const provider = getProvider(connection.provider);

  const srcCfg = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connectionId))
    .limit(1);
  if (srcCfg.length === 0) {
    // Mapping not complete — skip
    return { upserted: 0, deleted: 0 };
  }
  const cfg = srcCfg[0];

  // Load synced pipelines + stages
  const syncedPipelines = await db
    .select({
      localId: crmPipelines.id,
      externalId: crmPipelines.externalId,
    })
    .from(crmPipelines)
    .where(
      and(eq(crmPipelines.connectionId, connectionId), eq(crmPipelines.isSynced, true))
    );
  if (syncedPipelines.length === 0) return { upserted: 0, deleted: 0 };

  const pipelineIdByExternal = new Map(syncedPipelines.map((p) => [p.externalId, p.localId]));
  const pipelineExternalIds = syncedPipelines.map((p) => p.externalId);

  const syncedStages = await db
    .select({
      localId: crmStages.id,
      externalId: crmStages.externalId,
      pipelineId: crmStages.pipelineId,
    })
    .from(crmStages)
    .where(
      and(
        inArray(
          crmStages.pipelineId,
          syncedPipelines.map((p) => p.localId)
        ),
        eq(crmStages.isSynced, true)
      )
    );
  const stageIdByExternal = new Map<string, string>();
  for (const s of syncedStages) stageIdByExternal.set(s.externalId, s.localId);
  const openStageExternalIds = syncedStages.map((s) => s.externalId);

  // Fetch all stages of synced pipelines (for won-deal stage resolution)
  const allStagesOfSyncedPipelines = await db
    .select({
      localId: crmStages.id,
      externalId: crmStages.externalId,
    })
    .from(crmStages)
    .where(
      inArray(
        crmStages.pipelineId,
        syncedPipelines.map((p) => p.localId)
      )
    );
  const anyStageExternalToLocal = new Map(
    allStagesOfSyncedPipelines.map((s) => [s.externalId, s.localId])
  );

  let upserted = 0;

  for await (const deal of provider.fetchDeals({
    conn: {
      accessToken: connection.accessToken,
      apiDomain: connection.externalCompanyDomain
        ? `${connection.externalCompanyDomain}.pipedrive.com`
        : "api.pipedrive.com",
    },
    pipelineExternalIds,
    openStageExternalIds,
    statuses: ["open", "won"],
    sourceFieldType: cfg.sourceFieldType as "channel" | "custom",
    sourceFieldKey: cfg.sourceFieldKey,
    updatedSince: updatedSince ?? undefined,
    addedSince: addedSince ?? undefined,
  })) {
    const pipelineLocalId = pipelineIdByExternal.get(deal.pipelineExternalId);
    const stageLocalId =
      stageIdByExternal.get(deal.stageExternalId) ??
      anyStageExternalToLocal.get(deal.stageExternalId) ??
      null;
    if (!pipelineLocalId) continue;

    await db
      .insert(crmDeals)
      .values({
        connectionId,
        accountId: connection.accountId,
        externalId: deal.externalId,
        title: deal.title,
        value: deal.value !== null ? String(deal.value) : null,
        currency: deal.currency,
        status: deal.status,
        pipelineId: pipelineLocalId,
        stageId: stageLocalId,
        sourceExternalId: deal.sourceExternalId,
        ownerName: deal.ownerName,
        personName: deal.personName,
        orgName: deal.orgName,
        addTime: deal.addTime,
        updateTime: deal.updateTime,
        wonTime: deal.wonTime,
        rawData: deal.rawData,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [crmDeals.connectionId, crmDeals.externalId],
        set: {
          title: deal.title,
          value: deal.value !== null ? String(deal.value) : null,
          currency: deal.currency,
          status: deal.status,
          pipelineId: pipelineLocalId,
          stageId: stageLocalId,
          sourceExternalId: deal.sourceExternalId,
          ownerName: deal.ownerName,
          personName: deal.personName,
          orgName: deal.orgName,
          updateTime: deal.updateTime,
          wonTime: deal.wonTime,
          rawData: deal.rawData,
          lastSyncedAt: new Date(),
        },
      });
    upserted++;
  }

  // Lost/deleted cleanup (incremental only)
  let deleted = 0;
  if (updatedSince) {
    const lostIds = await withRefresh(connection, (ctx) =>
      provider.fetchLostOrDeletedIdsSince(ctx, updatedSince)
    );
    if (lostIds.length > 0) {
      const result = await db
        .delete(crmDeals)
        .where(
          and(eq(crmDeals.connectionId, connectionId), inArray(crmDeals.externalId, lostIds))
        );
      deleted = lostIds.length;
    }
  }

  return { upserted, deleted };
}
