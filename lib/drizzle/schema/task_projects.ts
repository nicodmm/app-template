import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const taskProjects = pgTable(
  "task_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("task_projects_workspace_idx").on(table.workspaceId)]
);

export type TaskProject = typeof taskProjects.$inferSelect;
export type NewTaskProject = typeof taskProjects.$inferInsert;
