import { pgTable, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";
import { taskProjects } from "./task_projects";
import { users } from "./users";

export const taskProjectMembers = pgTable(
  "task_project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => taskProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })]
);

export type TaskProjectMember = typeof taskProjectMembers.$inferSelect;
export type NewTaskProjectMember = typeof taskProjectMembers.$inferInsert;
