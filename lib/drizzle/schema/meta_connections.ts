import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const metaConnections = pgTable(
  "meta_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    metaUserId: text("meta_user_id").notNull(),
    metaUserName: text("meta_user_name"),
    accessToken: text("access_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at"),
    scopes: text("scopes"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meta_connections_workspace_idx").on(table.workspaceId),
    index("meta_connections_status_idx").on(table.status),
  ]
);

export type MetaConnection = typeof metaConnections.$inferSelect;
export type NewMetaConnection = typeof metaConnections.$inferInsert;
