import { pgTable, timestamp, uuid, integer, date, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";
import { metaCampaigns } from "./meta_campaigns";
import { metaAds } from "./meta_ads";

export const metaAdInsightsDaily = pgTable(
  "meta_ad_insights_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    adId: uuid("ad_id")
      .notNull()
      .references(() => metaAds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => metaCampaigns.id, { onDelete: "cascade" }),
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
    uniqueIndex("meta_ad_insights_daily_unique_idx").on(
      table.adAccountId,
      table.adId,
      table.date
    ),
    index("meta_ad_insights_daily_ad_account_date_idx").on(table.adAccountId, table.date),
    index("meta_ad_insights_daily_campaign_date_idx").on(table.campaignId, table.date),
  ]
);

export type MetaAdInsightDaily = typeof metaAdInsightsDaily.$inferSelect;
export type NewMetaAdInsightDaily = typeof metaAdInsightsDaily.$inferInsert;
