import { pgTable, text, timestamp, uuid, integer, date, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";

export const financeEngagements = pgTable(
  "finance_engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    neurona: text("neurona").notNull(),
    currency: text("currency").notNull().default("USD"),
    billingRule: text("billing_rule").notNull().default("mep"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("finance_engagements_account_idx").on(table.accountId),
    index("finance_engagements_workspace_idx").on(table.workspaceId),
    index("finance_engagements_account_status_idx").on(table.accountId, table.status),
  ]
);

export type FinanceEngagement = typeof financeEngagements.$inferSelect;
export type NewFinanceEngagement = typeof financeEngagements.$inferInsert;
