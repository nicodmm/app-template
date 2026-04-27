import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  jsonb,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export interface SnapshotWorkspaceRow {
  workspaceId: string;
  workspaceName: string;
  ownerDisplay: string | null;
  accountsActive: number;
  transcripts30d: number;
  signalsActive: number;
  /** ISO timestamp serialized to JSON. */
  lastActivityAt: string | null;
}

export interface SnapshotLlmTaskRow {
  taskName: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface SnapshotUserRow {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  workspacesCount: number;
  transcripts30d: number;
  /** ISO timestamp serialized to JSON. */
  lastActivityAt: string | null;
  /** ISO timestamp serialized to JSON. */
  createdAt: string;
}

/**
 * Singleton-row table that holds the precomputed platform-admin
 * dashboard rollup. Refreshed in background by the
 * `refresh-admin-dashboard` Trigger.dev task; admin page reads with
 * a single SELECT — never touches the heavy aggregate sources at
 * request time.
 *
 * `kind` is a unique-constrained column that always equals "global"
 * for now, so upserts target it and we never end up with multiple
 * snapshot rows. (Multi-tenant snapshots would extend `kind` to
 * include a workspace/owner identifier.)
 */
export const adminDashboardSnapshot = pgTable("admin_dashboard_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull().unique().default("global"),

  // Counters
  workspacesTotal: integer("workspaces_total").notNull().default(0),
  workspacesNew30d: integer("workspaces_new_30d").notNull().default(0),
  usersTotal: integer("users_total").notNull().default(0),
  usersNew30d: integer("users_new_30d").notNull().default(0),
  accountsActive: integer("accounts_active").notNull().default(0),
  transcriptsCompleted30d: integer("transcripts_completed_30d")
    .notNull()
    .default(0),

  // LLM money / token aggregates. numeric for cost (decimal precision),
  // bigint for token counts (just-in-case headroom over int4).
  llmCostUsd30d: numeric("llm_cost_usd_30d", { precision: 14, scale: 6 })
    .notNull()
    .default("0"),
  llmTokensTotal30d: bigint("llm_tokens_total_30d", { mode: "number" })
    .notNull()
    .default(0),
  llmCostUsdLifetime: numeric("llm_cost_usd_lifetime", {
    precision: 14,
    scale: 6,
  })
    .notNull()
    .default("0"),
  llmTokensLifetime: bigint("llm_tokens_lifetime", { mode: "number" })
    .notNull()
    .default(0),

  // Variable-length payloads — jsonb is cheaper to read in one go than
  // joining additional tables.
  topWorkspaces: jsonb("top_workspaces")
    .$type<SnapshotWorkspaceRow[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  llmByTask: jsonb("llm_by_task")
    .$type<SnapshotLlmTaskRow[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  topUsers: jsonb("top_users")
    .$type<SnapshotUserRow[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  refreshedAt: timestamp("refreshed_at").notNull().defaultNow(),
});

export type AdminDashboardSnapshotRow =
  typeof adminDashboardSnapshot.$inferSelect;
export type NewAdminDashboardSnapshotRow =
  typeof adminDashboardSnapshot.$inferInsert;
