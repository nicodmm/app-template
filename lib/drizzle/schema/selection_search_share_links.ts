import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { selectionSearches } from "./selection_searches";

export const selectionSearchShareLinks = pgTable(
  "selection_search_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    searchId: uuid("search_id")
      .notNull()
      .references(() => selectionSearches.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    passwordHash: text("password_hash"),
    passwordVersion: integer("password_version").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    viewCount: integer("view_count").notNull().default(0),
    lastAccessedAt: timestamp("last_accessed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("selection_search_share_links_search_idx").on(table.searchId)]
);

export type SelectionSearchShareLink = typeof selectionSearchShareLinks.$inferSelect;
export type NewSelectionSearchShareLink = typeof selectionSearchShareLinks.$inferInsert;
