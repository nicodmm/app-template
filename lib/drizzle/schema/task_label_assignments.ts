import { pgTable, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { taskLabels } from "./task_labels";

export const taskLabelAssignments = pgTable(
  "task_label_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => taskLabels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_label_assignments_unique").on(table.taskId, table.labelId),
    index("task_label_assignments_task_idx").on(table.taskId),
  ]
);

export type TaskLabelAssignment = typeof taskLabelAssignments.$inferSelect;
export type NewTaskLabelAssignment = typeof taskLabelAssignments.$inferInsert;
