import { pgTable, text, timestamp, uuid, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_unique").on(
      table.workspaceId,
      table.userId
    ),
    check(
      "workspace_members_role_check",
      sql`${table.role} IN ('owner', 'admin', 'member')`
    ),
  ]
);

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
