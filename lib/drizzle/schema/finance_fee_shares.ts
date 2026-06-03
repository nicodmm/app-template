import { pgTable, text, timestamp, uuid, numeric, date, index } from "drizzle-orm/pg-core";
import { financeEngagements } from "./finance_engagements";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { workspaceMembers } from "./workspace_members";

export const financeFeeShares = pgTable(
  "finance_fee_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id").notNull().references(() => financeEngagements.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => workspaceMembers.id, { onDelete: "set null" }),
    consultantNameRaw: text("consultant_name_raw"),
    shareType: text("share_type").notNull(),
    shareValue: numeric("share_value", { precision: 14, scale: 2 }).notNull(),
    shareCurrency: text("share_currency"),
    appliesFrom: date("applies_from"),
    appliesTo: date("applies_to"),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("finance_fee_shares_engagement_idx").on(table.engagementId),
    index("finance_fee_shares_member_idx").on(table.memberId),
    index("finance_fee_shares_account_idx").on(table.accountId),
  ]
);

export type FinanceFeeShare = typeof financeFeeShares.$inferSelect;
export type NewFinanceFeeShare = typeof financeFeeShares.$inferInsert;
