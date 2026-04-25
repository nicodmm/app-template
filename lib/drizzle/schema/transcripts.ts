import { pgTable, text, timestamp, uuid, integer, index, date } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    fileName: text("file_name"),
    sourceType: text("source_type").notNull().default("paste"),
    googleDriveFileId: text("google_drive_file_id"),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    triggerJobId: text("trigger_job_id"),
    status: text("status").notNull().default("pending"),
    progressPercentage: integer("progress_percentage").notNull().default(0),
    errorMessage: text("error_message"),
    meetingSummary: text("meeting_summary"),
    meetingDate: date("meeting_date"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("transcripts_account_id_idx").on(table.accountId),
    index("transcripts_status_idx").on(table.status),
    index("transcripts_account_hash_idx").on(table.accountId, table.contentHash),
    index("transcripts_account_created_idx").on(table.accountId, table.createdAt),
    index("transcripts_drive_file_idx").on(table.googleDriveFileId),
  ]
);

export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
