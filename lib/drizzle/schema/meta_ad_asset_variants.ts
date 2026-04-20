import { pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";
import { metaAds } from "./meta_ads";

export const metaAdAssetVariants = pgTable(
  "meta_ad_asset_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    adId: uuid("ad_id")
      .notNull()
      .references(() => metaAds.id, { onDelete: "cascade" }),
    metaAssetHash: text("meta_asset_hash").notNull(),
    name: text("name"),
    imageUrl: text("image_url"),
    thumbnailUrl: text("thumbnail_url"),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_ad_asset_variants_unique_idx").on(table.adId, table.metaAssetHash),
    index("meta_ad_asset_variants_ad_idx").on(table.adId),
  ]
);

export type MetaAdAssetVariant = typeof metaAdAssetVariants.$inferSelect;
export type NewMetaAdAssetVariant = typeof metaAdAssetVariants.$inferInsert;
