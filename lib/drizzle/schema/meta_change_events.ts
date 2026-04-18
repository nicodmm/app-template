import { pgTable, text, timestamp, uuid, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { metaAdAccounts } from "./meta_ad_accounts";

export const metaChangeEvents = pgTable(
  "meta_change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // 'campaign' | 'ad_set' | 'ad'
    entityMetaId: text("entity_meta_id").notNull(),
    entityLocalId: uuid("entity_local_id"), // soft FK to meta_campaigns.id or meta_ads.id; null for ad_set
    eventType: text("event_type").notNull(),
    eventData: jsonb("event_data").notNull(),
    rawActivity: jsonb("raw_activity").notNull(),
    parentCampaignMetaId: text("parent_campaign_meta_id"), // populated for ad_set events
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_change_events_unique_idx").on(
      table.adAccountId,
      table.entityMetaId,
      table.eventType,
      table.occurredAt
    ),
    index("meta_change_events_timeline_idx").on(table.adAccountId, table.occurredAt.desc()),
    index("meta_change_events_entity_idx").on(table.entityType, table.entityMetaId),
    index("meta_change_events_parent_campaign_idx").on(table.entityType, table.parentCampaignMetaId),
    check(
      "meta_change_events_entity_type_check",
      sql`entity_type IN ('campaign', 'ad_set', 'ad')`
    ),
  ]
);

export type MetaChangeEvent = typeof metaChangeEvents.$inferSelect;
export type NewMetaChangeEvent = typeof metaChangeEvents.$inferInsert;
