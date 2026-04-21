import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { transcripts } from "./transcripts";

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    firstTranscriptId: uuid("first_transcript_id").references(() => transcripts.id, {
      onDelete: "set null",
    }),
    lastTranscriptId: uuid("last_transcript_id").references(() => transcripts.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email"),
    role: text("role"),
    confidence: text("confidence").notNull().default("medium"),
    appearanceCount: integer("appearance_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("participants_account_idx").on(table.accountId),
    index("participants_account_email_idx").on(table.accountId, table.email),
    index("participants_workspace_idx").on(table.workspaceId),
  ]
);

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
