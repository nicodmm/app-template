import { pgTable, timestamp, uuid, integer, date, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";
import { metaAds } from "./meta_ads";
import { metaAdAssetVariants } from "./meta_ad_asset_variants";

export const metaAdAssetInsightsDaily = pgTable(
  "meta_ad_asset_insights_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    assetVariantId: uuid("asset_variant_id")
      .notNull()
      .references(() => metaAdAssetVariants.id, { onDelete: "cascade" }),
    adId: uuid("ad_id")
      .notNull()
      .references(() => metaAds.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    spend: integer("spend").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    conversions: integer("conversions").notNull().default(0),
    conversionValue: integer("conversion_value"),
    frequency: numeric("frequency", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_ad_asset_insights_daily_unique_idx").on(
      table.adAccountId,
      table.assetVariantId,
      table.date
    ),
    index("meta_ad_asset_insights_daily_ad_date_idx").on(table.adId, table.date),
  ]
);

export type MetaAdAssetInsightDaily = typeof metaAdAssetInsightsDaily.$inferSelect;
export type NewMetaAdAssetInsightDaily = typeof metaAdAssetInsightsDaily.$inferInsert;
