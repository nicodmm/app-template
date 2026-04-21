import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { crmConnections } from "./crm_connections";

export const crmSourceConfig = pgTable("crm_source_config", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => crmConnections.id, { onDelete: "cascade" }),
  sourceFieldType: text("source_field_type").notNull(),
  sourceFieldKey: text("source_field_key").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CrmSourceConfig = typeof crmSourceConfig.$inferSelect;
export type NewCrmSourceConfig = typeof crmSourceConfig.$inferInsert;
