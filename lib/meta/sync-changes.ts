import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaChangeEvents, metaCampaigns, metaAds } from "@/lib/drizzle/schema";
import { metaGraphFetch, paginate } from "./client";

// Maps Meta's raw event_type to our normalized {entityType, eventType} tuple.
// Anything not in this map is dropped.
const EVENT_MAP: Record<string, { entityType: "campaign" | "ad_set" | "ad"; eventType: string }> = {
  // Campaign-level (Meta uses "campaign_group" for what we call campaign)
  create_campaign_group: { entityType: "campaign", eventType: "campaign_created" },
  update_campaign_group_status: { entityType: "campaign", eventType: "campaign_status_change" },
  update_campaign_group_budget: { entityType: "campaign", eventType: "campaign_budget_change" },
  update_campaign_name: { entityType: "campaign", eventType: "campaign_name_change" },
  update_campaign_schedule: { entityType: "campaign", eventType: "campaign_schedule_change" },
  update_campaign_objective: { entityType: "campaign", eventType: "campaign_objective_change" },
  delete_campaign_group: { entityType: "campaign", eventType: "campaign_deleted" },
  // Ad set-level (Meta uses "campaign" for what we call ad_set)
  create_campaign: { entityType: "ad_set", eventType: "ad_set_created" },
  update_campaign_targeting: { entityType: "ad_set", eventType: "ad_set_targeting_change" },
  update_campaign_budget: { entityType: "ad_set", eventType: "ad_set_budget_change" },
  update_campaign_run_status: { entityType: "ad_set", eventType: "ad_set_status_change" },
  delete_campaign: { entityType: "ad_set", eventType: "ad_set_deleted" },
  // Ad-level
  create_ad: { entityType: "ad", eventType: "ad_created" },
  update_ad_status: { entityType: "ad", eventType: "ad_status_change" },
  update_ad_creative: { entityType: "ad", eventType: "ad_creative_change" },
  update_ad_run_status: { entityType: "ad", eventType: "ad_run_status_change" },
  delete_ad: { entityType: "ad", eventType: "ad_deleted" },
  // Creative asset changes (very common on dynamic ads)
  edit_images: { entityType: "ad", eventType: "ad_images_edited" },
  add_images: { entityType: "ad", eventType: "ad_images_added" },
};

type ActivityApiRow = {
  event_type: string;
  event_time: string; // ISO timestamp
  object_id?: string;
  object_type?: string;
  object_name?: string;
  actor_id?: string;
  actor_name?: string;
  extra_data?: string; // JSON string from Meta
};

type AdSetParentCacheEntry = string | null; // campaign_id or null if not found

async function resolveAdSetParent(
  adSetMetaId: string,
  accessToken: string,
  cache: Map<string, AdSetParentCacheEntry>
): Promise<string | null> {
  if (cache.has(adSetMetaId)) return cache.get(adSetMetaId) ?? null;
  try {
    const data = await metaGraphFetch<{ id: string; campaign_id?: string }>(
      `/${adSetMetaId}`,
      {
        accessToken,
        searchParams: { fields: "campaign_id" },
      }
    );
    const parent = data.campaign_id ?? null;
    cache.set(adSetMetaId, parent);
    return parent;
  } catch {
    cache.set(adSetMetaId, null);
    return null;
  }
}

async function resolveLocalId(
  entityType: "campaign" | "ad_set" | "ad",
  entityMetaId: string,
  adAccountRowId: string
): Promise<string | null> {
  if (entityType === "campaign") {
    const rows = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .where(
        and(
          eq(metaCampaigns.adAccountId, adAccountRowId),
          eq(metaCampaigns.metaCampaignId, entityMetaId)
        )
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }
  if (entityType === "ad") {
    const rows = await db
      .select({ id: metaAds.id })
      .from(metaAds)
      .where(and(eq(metaAds.adAccountId, adAccountRowId), eq(metaAds.metaAdId, entityMetaId)))
      .limit(1);
    return rows[0]?.id ?? null;
  }
  return null; // ad_set has no local table
}

function parseExtraData(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _unparseable: raw };
  }
}

export async function fetchAndUpsertChangeEvents(
  adAccountRowId: string,
  metaAdAccountId: string,
  accessToken: string,
  since: Date
): Promise<number> {
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const untilUnix = Math.floor(Date.now() / 1000);

  const parentCache = new Map<string, AdSetParentCacheEntry>();
  const droppedCounts = new Map<string, number>();
  const keptCounts = new Map<string, number>();
  let upserts = 0;
  let totalSeen = 0;

  for await (const row of paginate<ActivityApiRow>(
    `/${metaAdAccountId}/activities`,
    {
      accessToken,
      searchParams: {
        fields: "event_type,event_time,object_id,object_type,object_name,actor_id,actor_name,extra_data",
        since: sinceUnix,
        until: untilUnix,
        limit: 500,
      },
    }
  )) {
    totalSeen++;
    const mapped = EVENT_MAP[row.event_type];
    if (!mapped) {
      droppedCounts.set(row.event_type, (droppedCounts.get(row.event_type) ?? 0) + 1);
      continue;
    }
    keptCounts.set(row.event_type, (keptCounts.get(row.event_type) ?? 0) + 1);
    if (!row.object_id || !row.event_time) continue;

    const entityType = mapped.entityType;
    const entityMetaId = row.object_id;
    const eventType = mapped.eventType;
    const occurredAt = new Date(row.event_time);
    const eventData = parseExtraData(row.extra_data);

    const entityLocalId = await resolveLocalId(entityType, entityMetaId, adAccountRowId);

    let parentCampaignMetaId: string | null = null;
    if (entityType === "ad_set") {
      parentCampaignMetaId = await resolveAdSetParent(entityMetaId, accessToken, parentCache);
    }

    await db
      .insert(metaChangeEvents)
      .values({
        adAccountId: adAccountRowId,
        entityType,
        entityMetaId,
        entityLocalId,
        eventType,
        eventData,
        rawActivity: row,
        parentCampaignMetaId,
        occurredAt,
      })
      .onConflictDoNothing({
        target: [
          metaChangeEvents.adAccountId,
          metaChangeEvents.entityMetaId,
          metaChangeEvents.eventType,
          metaChangeEvents.occurredAt,
        ],
      });
    upserts++;
  }

  const fmt = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}(${n})`)
      .join(", ");

  console.warn(
    `[sync-changes] total=${totalSeen} kept=${upserts} ` +
      `KEPT: ${keptCounts.size > 0 ? fmt(keptCounts) : "none"} | ` +
      `DROPPED: ${droppedCounts.size > 0 ? fmt(droppedCounts) : "none"}`
  );

  return upserts;
}

// Backfill retention: prune events older than 90 days to match insights retention.
export async function pruneOldChangeEvents(adAccountRowId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 86400000);
  await db
    .delete(metaChangeEvents)
    .where(
      and(
        eq(metaChangeEvents.adAccountId, adAccountRowId),
        lt(metaChangeEvents.occurredAt, cutoff)
      )
    );
}
