import { pgTable, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { taskComments } from "./task_comments";
import { users } from "./users";

export const taskCommentMentions = pgTable(
  "task_comment_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => taskComments.id, { onDelete: "cascade" }),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("task_comment_mentions_comment_idx").on(table.commentId),
    index("task_comment_mentions_user_idx").on(table.mentionedUserId),
  ]
);

export type TaskCommentMention = typeof taskCommentMentions.$inferSelect;
export type NewTaskCommentMention = typeof taskCommentMentions.$inferInsert;
