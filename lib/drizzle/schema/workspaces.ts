import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  /**
   * Workspace-managed service catalog used as the source for
   * `accounts.serviceScope` checkboxes. String array — accounts capture
   * point-in-time names, so renaming here doesn't break existing rows.
   */
  services: jsonb("services").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /**
   * Free-text context about the agency itself (what they do, ICP, upsell
   * patterns, churn signals to watch). Injected into the detect-signals
   * prompt so the AI can produce more relevant suggestions.
   */
  agencyContext: text("agency_context"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
