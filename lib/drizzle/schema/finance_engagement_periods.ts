import { pgTable, text, timestamp, uuid, numeric, date, index } from "drizzle-orm/pg-core";
import { financeEngagements } from "./finance_engagements";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";

export const financeEngagementPeriods = pgTable(
  "finance_engagement_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id").notNull().references(() => financeEngagements.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date"),
    fee: numeric("fee", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("finance_engagement_periods_engagement_idx").on(table.engagementId),
    index("finance_engagement_periods_account_idx").on(table.accountId),
  ]
);

export type FinanceEngagementPeriod = typeof financeEngagementPeriods.$inferSelect;
export type NewFinanceEngagementPeriod = typeof financeEngagementPeriods.$inferInsert;
