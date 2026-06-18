import { pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const selectionSearches = pgTable(
  "selection_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    position: text("position").notNull(),
    positionDescription: text("position_description"),
    // "active" | "paused" | "closed"
    status: text("status").notNull().default("active"),
    // true = no se muestra en el link público general de la cuenta. La agencia la
    // sigue viendo en la app; se comparte por su link individual.
    confidential: boolean("confidential").notNull().default(false),
    razonSocial: text("razon_social"),
    cuit: text("cuit"),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (table) => [
    index("selection_searches_account_idx").on(table.accountId),
    index("selection_searches_workspace_idx").on(table.workspaceId),
    index("selection_searches_account_status_idx").on(table.accountId, table.status),
  ]
);

export type SelectionSearch = typeof selectionSearches.$inferSelect;
export type NewSelectionSearch = typeof selectionSearches.$inferInsert;
