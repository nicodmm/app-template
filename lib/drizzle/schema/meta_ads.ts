import { pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";
import { metaCampaigns } from "./meta_campaigns";

export const metaAds = pgTable(
  "meta_ads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => metaCampaigns.id, { onDelete: "cascade" }),
    metaAdId: text("meta_ad_id").notNull(),
    name: text("name").notNull(),
    publicName: text("public_name"),
    status: text("status").notNull().default("ACTIVE"),
    creativeId: text("creative_id"),
    thumbnailUrl: text("thumbnail_url"),
    imageUrl: text("image_url"),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meta_ads_campaign_idx").on(table.campaignId),
    uniqueIndex("meta_ads_unique_idx").on(table.adAccountId, table.metaAdId),
  ]
);

export type MetaAd = typeof metaAds.$inferSelect;
export type NewMetaAd = typeof metaAds.$inferInsert;
