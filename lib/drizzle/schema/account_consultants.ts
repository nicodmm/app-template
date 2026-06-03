import { pgTable, text, timestamp, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const accountConsultants = pgTable(
  "account_consultants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    neurona: text("neurona"),
    roleLabel: text("role_label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("account_consultants_unique").on(table.accountId, table.userId, table.neurona),
    index("account_consultants_account_idx").on(table.accountId),
  ]
);

export type AccountConsultant = typeof accountConsultants.$inferSelect;
export type NewAccountConsultant = typeof accountConsultants.$inferInsert;
