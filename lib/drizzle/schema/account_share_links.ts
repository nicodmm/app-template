import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const accountShareLinks = pgTable(
  "account_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    passwordHash: text("password_hash"),
    passwordVersion: integer("password_version").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    shareConfig: jsonb("share_config")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    viewCount: integer("view_count").notNull().default(0),
    lastAccessedAt: timestamp("last_accessed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("account_share_links_account_idx").on(table.accountId),
  ]
);

export type AccountShareLink = typeof accountShareLinks.$inferSelect;
export type NewAccountShareLink = typeof accountShareLinks.$inferInsert;
