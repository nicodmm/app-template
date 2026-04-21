import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { crmConnections } from "./crm_connections";

export const crmSources = pgTable(
  "crm_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => crmConnections.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_sources_unique_idx").on(t.connectionId, t.externalId)]
);

export type CrmSource = typeof crmSources.$inferSelect;
export type NewCrmSource = typeof crmSources.$inferInsert;
