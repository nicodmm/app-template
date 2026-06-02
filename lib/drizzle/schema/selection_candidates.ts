import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { selectionSearches } from "./selection_searches";

export const selectionCandidates = pgTable(
  "selection_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    searchId: uuid("search_id")
      .notNull()
      .references(() => selectionSearches.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),

    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    expectedSalary: text("expected_salary"),
    currentSalary: text("current_salary"),

    // "pending" | "advance" | "offer" | "rejected"
    status: text("status").notNull().default("pending"),
    clientRating: integer("client_rating").notNull().default(0),
    clientNotes: text("client_notes"),

    interviewModality: text("interview_modality"),
    interviewSchedule: text("interview_schedule"),
    offerConditions: text("offer_conditions"),
    rejectionReason: text("rejection_reason"),
    feedbackAt: timestamp("feedback_at"),

    cvStoragePath: text("cv_storage_path"),
    cvUrl: text("cv_url"),
    cvFileName: text("cv_file_name"),
    cvMimeType: text("cv_mime_type"),
    cvFileSize: integer("cv_file_size"),
    cvExtractedText: text("cv_extracted_text"),

    recruiterNotes: text("recruiter_notes"),

    reportContent: text("report_content"),
    // "none" | "generating" | "ready" | "error"
    reportStatus: text("report_status").notNull().default("none"),
    reportError: text("report_error"),
    reportGeneratedAt: timestamp("report_generated_at"),
    reportEditedAt: timestamp("report_edited_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("selection_candidates_search_idx").on(table.searchId),
    index("selection_candidates_account_idx").on(table.accountId),
    index("selection_candidates_account_status_idx").on(table.accountId, table.status),
    index("selection_candidates_search_status_idx").on(table.searchId, table.status),
  ]
);

export type SelectionCandidate = typeof selectionCandidates.$inferSelect;
export type NewSelectionCandidate = typeof selectionCandidates.$inferInsert;
