import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { transcripts } from "./transcripts";

export const accountHealthHistory = pgTable(
  "account_health_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    transcriptId: uuid("transcript_id").references(() => transcripts.id, {
      onDelete: "set null",
    }),
    healthSignal: text("health_signal").notNull(),
    justification: text("justification"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("health_history_account_created_idx").on(table.accountId, table.createdAt),
  ]
);

export type AccountHealthHistory = typeof accountHealthHistory.$inferSelect;
export type NewAccountHealthHistory = typeof accountHealthHistory.$inferInsert;
