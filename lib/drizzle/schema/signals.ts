import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { transcripts } from "./transcripts";
import { users } from "./users";

export const signals = pgTable(
  "signals",
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
    triggerSource: text("trigger_source").notNull().default("transcript_processing"),
    type: text("type").notNull(),
    status: text("status").notNull().default("active"),
    description: text("description").notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("signals_account_type_status_idx").on(table.accountId, table.type, table.status),
    index("signals_account_status_idx").on(table.accountId, table.status),
    index("signals_workspace_idx").on(table.workspaceId),
  ]
);

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
