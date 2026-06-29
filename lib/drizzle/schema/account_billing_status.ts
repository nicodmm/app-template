import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";

/**
 * Estado de facturación a nivel cuenta/mes (uno por cuenta por período). Es la
 * fuente de verdad del "Estado de la factura" que se ve tanto en "A facturar"
 * como en el interno de cada cuenta. Los valores válidos están en
 * `lib/finance/billing-meta.ts` (pending/billed/payment_pending/paid).
 */
export const accountBillingStatus = pgTable(
  "account_billing_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: text("status").notNull().default("pending"),
    billedAt: timestamp("billed_at"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("account_billing_status_account_period_unique").on(
      table.accountId,
      table.year,
      table.month
    ),
    index("account_billing_status_workspace_period_idx").on(
      table.workspaceId,
      table.year,
      table.month
    ),
  ]
);

export type AccountBillingStatus = typeof accountBillingStatus.$inferSelect;
export type NewAccountBillingStatus = typeof accountBillingStatus.$inferInsert;
