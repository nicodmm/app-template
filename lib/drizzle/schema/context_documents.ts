import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const contextDocuments = pgTable(
  "context_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // "note" | "presentation" | "report" | "spreadsheet" | "other"
    docType: text("doc_type").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    extractedText: text("extracted_text"),
    googleDriveFileId: text("google_drive_file_id"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("context_documents_account_idx").on(table.accountId),
    index("context_documents_workspace_idx").on(table.workspaceId),
    index("context_documents_account_created_idx").on(
      table.accountId,
      table.createdAt
    ),
    index("context_documents_drive_file_idx").on(table.googleDriveFileId),
  ]
);

export type ContextDocument = typeof contextDocuments.$inferSelect;
export type NewContextDocument = typeof contextDocuments.$inferInsert;
