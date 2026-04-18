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

type SyncStats = {
  totalSeen: number;
  inserted: number;
  dropped: Map<string, number>;
  kept: Map<string, number>;
};

async function ingestActivityRow(
  row: ActivityApiRow,
  adAccountRowId: string,
  accessToken: string,
  parentCache: Map<string, AdSetParentCacheEntry>,
  seenKeys: Set<string>,
  stats: SyncStats
): Promise<void> {
  stats.totalSeen++;
  const mapped = EVENT_MAP[row.event_type];
  if (!mapped) {
    stats.dropped.set(row.event_type, (stats.dropped.get(row.event_type) ?? 0) + 1);
    return;
  }
  if (!row.object_id || !row.event_time) return;

  const entityType = mapped.entityType;
  const entityMetaId = row.object_id;
  const eventType = mapped.eventType;
  const occurredAt = new Date(row.event_time);

  // In-process dedup across the multiple API sources (account-wide + per-entity).
  const dedupeKey = `${entityMetaId}|${eventType}|${occurredAt.toISOString()}`;
  if (seenKeys.has(dedupeKey)) return;
  seenKeys.add(dedupeKey);

  stats.kept.set(row.event_type, (stats.kept.get(row.event_type) ?? 0) + 1);

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
  stats.inserted++;
}

// Meta's /act_{id}/activities default feed excludes certain categories. We call
// it once without category (covers most changes) plus a targeted second call
// for AD_REVIEW (ad status transitions like pending-review → active that are
// otherwise filtered out). Other plausible categories (AD, AD_SET, CAMPAIGN,
// ACCOUNT) are covered by the default feed — adding them yields duplicates.
const EXTRA_CATEGORIES = ["AD_REVIEW"] as const;

export async function fetchAndUpsertChangeEvents(params: {
  adAccountRowId: string;
  metaAdAccountId: string;
  accessToken: string;
  since: Date;
}): Promise<number> {
  const sinceUnix = Math.floor(params.since.getTime() / 1000);
  const untilUnix = Math.floor(Date.now() / 1000);

  const parentCache = new Map<string, AdSetParentCacheEntry>();
  const seenKeys = new Set<string>();
  const stats: SyncStats = {
    totalSeen: 0,
    inserted: 0,
    dropped: new Map(),
    kept: new Map(),
  };

  const baseFields =
    "event_type,event_time,object_id,object_type,object_name,actor_id,actor_name,extra_data";

  async function runFeed(category?: string): Promise<void> {
    const searchParams: Record<string, string | number> = {
      fields: baseFields,
      since: sinceUnix,
      until: untilUnix,
      limit: 500,
    };
    if (category) searchParams.category = category;

    try {
      for await (const row of paginate<ActivityApiRow>(
        `/${params.metaAdAccountId}/activities`,
        { accessToken: params.accessToken, searchParams }
      )) {
        await ingestActivityRow(
          row,
          params.adAccountRowId,
          params.accessToken,
          parentCache,
          seenKeys,
          stats
        );
      }
    } catch (err) {
      console.warn(
        `[sync-changes] feed failed (category=${category ?? "default"})`,
        err
      );
    }
  }

  // Default feed: covers most categories.
  await runFeed();

  // Extra category feeds for ones Meta excludes from the default response.
  for (const cat of EXTRA_CATEGORIES) {
    await runFeed(cat);
  }

  const fmt = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}(${n})`)
      .join(", ");

  console.warn(
    `[sync-changes] total=${stats.totalSeen} kept=${stats.inserted} ` +
      `KEPT: ${stats.kept.size > 0 ? fmt(stats.kept) : "none"} | ` +
      `DROPPED: ${stats.dropped.size > 0 ? fmt(stats.dropped) : "none"}`
  );

  return stats.inserted;
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
