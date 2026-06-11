import { pgTable, timestamp, uuid, integer, numeric } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const financeProjectionAssumptions = pgTable(
  "finance_projection_assumptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    breakevenUsd: numeric("breakeven_usd", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    otrosIngresosUsd: numeric("otros_ingresos_usd", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    clientesNuevosMes: integer("clientes_nuevos_mes").notNull().default(0),
    ticketMedioNuevoUsd: numeric("ticket_medio_nuevo_usd", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    churnUsdMes: numeric("churn_usd_mes", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    horizonteMeses: integer("horizonte_meses").notNull().default(6),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export type FinanceProjectionAssumptions =
  typeof financeProjectionAssumptions.$inferSelect;
export type NewFinanceProjectionAssumptions =
  typeof financeProjectionAssumptions.$inferInsert;
