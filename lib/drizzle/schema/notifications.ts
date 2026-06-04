import { pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";
import { tasks } from "./tasks";
import { accounts } from "./accounts";
import { taskComments } from "./task_comments";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'mention' | 'assignment'
    type: text("type").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    commentId: uuid("comment_id").references(() => taskComments.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_unread_idx").on(table.userId, table.isRead),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
