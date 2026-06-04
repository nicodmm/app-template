import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { transcripts } from "./transcripts";

export const taskMeetingMentions = pgTable(
  "task_meeting_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    transcriptId: uuid("transcript_id").references(() => transcripts.id, {
      onDelete: "set null",
    }),
    sourceExcerpt: text("source_excerpt"),
    sourceContext: text("source_context"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("task_meeting_mentions_task_idx").on(table.taskId),
    index("task_meeting_mentions_transcript_idx").on(table.transcriptId),
  ]
);

export type TaskMeetingMention = typeof taskMeetingMentions.$inferSelect;
export type NewTaskMeetingMention = typeof taskMeetingMentions.$inferInsert;
