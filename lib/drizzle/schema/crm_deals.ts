import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { crmConnections } from "./crm_connections";
import { accounts } from "./accounts";
import { crmPipelines } from "./crm_pipelines";
import { crmStages } from "./crm_stages";

export const crmDeals = pgTable(
  "crm_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => crmConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    value: numeric("value", { precision: 18, scale: 2 }),
    currency: text("currency"),
    status: text("status").notNull(),
    pipelineId: uuid("pipeline_id").references(() => crmPipelines.id, { onDelete: "set null" }),
    stageId: uuid("stage_id").references(() => crmStages.id, { onDelete: "set null" }),
    sourceExternalId: text("source_external_id"),
    ownerName: text("owner_name"),
    personName: text("person_name"),
    orgName: text("org_name"),
    addTime: timestamp("add_time").notNull(),
    updateTime: timestamp("update_time").notNull(),
    wonTime: timestamp("won_time"),
    rawData: jsonb("raw_data"),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_deals_unique_idx").on(t.connectionId, t.externalId),
    index("crm_deals_account_addtime_idx").on(t.accountId, t.addTime),
    index("crm_deals_account_status_idx").on(t.accountId, t.status),
    index("crm_deals_connection_source_idx").on(t.connectionId, t.sourceExternalId),
  ]
);

export type CrmDeal = typeof crmDeals.$inferSelect;
export type NewCrmDeal = typeof crmDeals.$inferInsert;
