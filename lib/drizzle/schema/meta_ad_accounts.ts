import { pgTable, text, timestamp, uuid, integer, boolean, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { accounts } from "./accounts";
import { metaConnections } from "./meta_connections";

export const metaAdAccounts = pgTable(
  "meta_ad_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => metaConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    metaAdAccountId: text("meta_ad_account_id").notNull(),
    metaBusinessId: text("meta_business_id"),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("USD"),
    timezone: text("timezone").notNull().default("UTC"),
    status: integer("status").notNull().default(1),
    isEcommerce: boolean("is_ecommerce").notNull().default(false),
    conversionEvent: text("conversion_event").notNull().default("lead"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meta_ad_accounts_workspace_idx").on(table.workspaceId),
    index("meta_ad_accounts_connection_idx").on(table.connectionId),
    index("meta_ad_accounts_account_idx").on(table.accountId),
    index("meta_ad_accounts_unique_idx").on(table.connectionId, table.metaAdAccountId),
  ]
);

export type MetaAdAccount = typeof metaAdAccounts.$inferSelect;
export type NewMetaAdAccount = typeof metaAdAccounts.$inferInsert;
