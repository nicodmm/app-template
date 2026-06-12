import { pgTable, text, timestamp, uuid, uniqueIndex, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const driveConnections = pgTable(
  "drive_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    scope: text("scope").notNull().default("personal"),
    googleAccountEmail: text("google_account_email"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at"),

    folderId: text("folder_id"),
    folderName: text("folder_name"),
    linkOnlySync: boolean("link_only_sync").notNull().default(false),

    status: text("status"),
    lastSyncAt: timestamp("last_sync_at"),
    lastError: text("last_error"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("drive_connections_ws_user_scope_unique").on(
      table.workspaceId,
      table.connectedByUserId,
      table.scope
    ),
    check("drive_connections_scope_check", sql`${table.scope} IN ('personal','workspace')`),
  ]
);

export type DriveConnection = typeof driveConnections.$inferSelect;
export type NewDriveConnection = typeof driveConnections.$inferInsert;
