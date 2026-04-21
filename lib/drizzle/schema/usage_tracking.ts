import { pgTable, integer, timestamp, uuid, date, uniqueIndex } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const usageTracking = pgTable(
  "usage_tracking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    transcriptsCount: integer("transcripts_count").notNull().default(0),
    wordsProcessed: integer("words_processed").notNull().default(0),
    accountsCount: integer("accounts_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("usage_tracking_workspace_month_unique").on(
      table.workspaceId,
      table.month
    ),
  ]
);

export type UsageTracking = typeof usageTracking.$inferSelect;
export type NewUsageTracking = typeof usageTracking.$inferInsert;
