import { pgTable, text, timestamp, uuid, integer, numeric, boolean, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { financeEngagements } from "./finance_engagements";

export const billingRecords = pgTable(
  "billing_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id").references(() => financeEngagements.id, { onDelete: "set null" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    concept: text("concept").notNull(),
    amountOriginal: numeric("amount_original", { precision: 14, scale: 2 }).notNull(),
    currencyOriginal: text("currency_original").notNull(),
    amountArs: numeric("amount_ars", { precision: 14, scale: 2 }),
    fxRateUsed: numeric("fx_rate_used", { precision: 14, scale: 4 }),
    ipcUsed: numeric("ipc_used", { precision: 10, scale: 4 }),
    status: text("status").notNull().default("pending"),
    billedAt: timestamp("billed_at"),
    paidAt: timestamp("paid_at"),
    isAdditional: boolean("is_additional").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("billing_records_workspace_period_idx").on(table.workspaceId, table.year, table.month),
    index("billing_records_account_period_idx").on(table.accountId, table.year, table.month),
    index("billing_records_workspace_status_idx").on(table.workspaceId, table.status),
  ]
);

export type BillingRecord = typeof billingRecords.$inferSelect;
export type NewBillingRecord = typeof billingRecords.$inferInsert;
