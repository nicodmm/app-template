import { pgTable, text, timestamp, uuid, boolean, index, date, numeric, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";
import type { AccountModuleKey } from "@/lib/modules-client";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    goals: text("goals"),
    serviceScope: text("service_scope"),
    startDate: date("start_date"),
    fee: numeric("fee", { precision: 12, scale: 2 }),
    enabledModules: jsonb("enabled_modules")
      .$type<Partial<Record<AccountModuleKey, boolean>>>()
      .notNull()
      .default({}),
    websiteUrl: text("website_url"),
    linkedinUrl: text("linkedin_url"),
    industry: text("industry"),
    employeeCount: text("employee_count"),
    location: text("location"),
    companyDescription: text("company_description"),
    enrichedAt: timestamp("enriched_at"),
    enrichmentStatus: text("enrichment_status"),
    enrichmentError: text("enrichment_error"),
    healthSignal: text("health_signal").default("inactive"),
    healthJustification: text("health_justification"),
    aiSummary: text("ai_summary"),
    aiSummaryUpdatedAt: timestamp("ai_summary_updated_at"),
    lastActivityAt: timestamp("last_activity_at"),
    hasAdConnections: boolean("has_ad_connections").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("accounts_workspace_id_idx").on(table.workspaceId),
    index("accounts_owner_id_idx").on(table.ownerId),
    index("accounts_workspace_health_idx").on(table.workspaceId, table.healthSignal),
    index("accounts_workspace_activity_idx").on(table.workspaceId, table.lastActivityAt),
  ]
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
