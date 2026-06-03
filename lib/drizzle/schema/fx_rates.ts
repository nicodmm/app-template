import { pgTable, timestamp, uuid, integer, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    mepRate: numeric("mep_rate", { precision: 14, scale: 4 }).notNull(),
    ipcCoefficient: numeric("ipc_coefficient", { precision: 10, scale: 4 }).default("1"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fx_rates_workspace_year_month_unique").on(table.workspaceId, table.year, table.month),
  ]
);

export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
