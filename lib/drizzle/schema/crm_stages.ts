import { pgTable, text, timestamp, uuid, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { crmPipelines } from "./crm_pipelines";

export const crmStages = pgTable(
  "crm_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => crmPipelines.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    orderNr: integer("order_nr").notNull().default(0),
    isSynced: boolean("is_synced").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_stages_unique_idx").on(t.pipelineId, t.externalId)]
);

export type CrmStage = typeof crmStages.$inferSelect;
export type NewCrmStage = typeof crmStages.$inferInsert;
