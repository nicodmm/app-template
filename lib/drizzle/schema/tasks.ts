import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { transcripts } from "./transcripts";
import { users } from "./users";

export const tasks = pgTable(
  "tasks",
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
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("ai_extracted"),
    sourceExcerpt: text("source_excerpt"),
    sourceContext: text("source_context"),
    priority: integer("priority").notNull().default(3),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("tasks_account_status_idx").on(table.accountId, table.status),
    index("tasks_workspace_idx").on(table.workspaceId),
    index("tasks_transcript_idx").on(table.transcriptId),
  ]
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
