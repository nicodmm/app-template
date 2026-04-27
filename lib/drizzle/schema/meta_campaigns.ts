import { pgTable, text, timestamp, uuid, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";

export const metaCampaigns = pgTable(
  "meta_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    metaCampaignId: text("meta_campaign_id").notNull(),
    name: text("name").notNull(),
    publicName: text("public_name"),
    status: text("status").notNull().default("ACTIVE"),
    objective: text("objective"),
    dailyBudget: integer("daily_budget"),
    lifetimeBudget: integer("lifetime_budget"),
    startTime: timestamp("start_time"),
    stopTime: timestamp("stop_time"),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meta_campaigns_ad_account_idx").on(table.adAccountId),
    uniqueIndex("meta_campaigns_unique_idx").on(table.adAccountId, table.metaCampaignId),
  ]
);

export type MetaCampaign = typeof metaCampaigns.$inferSelect;
export type NewMetaCampaign = typeof metaCampaigns.$inferInsert;
