import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { users } from "./users";

export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("task_attachments_task_idx").on(table.taskId)]
);

export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type NewTaskAttachment = typeof taskAttachments.$inferInsert;
