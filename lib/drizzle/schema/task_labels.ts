import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const taskLabels = pgTable(
  "task_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("task_labels_workspace_idx").on(table.workspaceId)]
);

export type TaskLabelRow = typeof taskLabels.$inferSelect;
export type NewTaskLabelRow = typeof taskLabels.$inferInsert;
