import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { accounts } from "./accounts";

export const crmConnections = pgTable(
  "crm_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalUserId: text("external_user_id").notNull(),
    externalCompanyId: text("external_company_id").notNull(),
    externalCompanyDomain: text("external_company_domain"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at").notNull(),
    status: text("status").notNull().default("active"),
    scope: text("scope"),
    catalogsLastRefresh: timestamp("catalogs_last_refresh"),
    catalogsConfiguredAt: timestamp("catalogs_configured_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_connections_account_provider_idx").on(t.accountId, t.provider)]
);

export type CrmConnection = typeof crmConnections.$inferSelect;
export type NewCrmConnection = typeof crmConnections.$inferInsert;
