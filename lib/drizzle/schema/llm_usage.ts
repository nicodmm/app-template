import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { accounts } from "./accounts";

/**
 * Per-call log of Anthropic API usage. One row per call.
 * Best-effort writes: a failure here must never break the LLM-driven
 * task. The admin dashboard aggregates by month / workspace / task.
 */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    /** Logical name of the trigger task or surface that issued the call. */
    taskName: text("task_name").notNull(),
    /** Model id as sent to the Anthropic API. */
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Total cost in USD computed from per-model pricing at log time. */
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("llm_usage_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("llm_usage_created_idx").on(table.createdAt),
    index("llm_usage_task_idx").on(table.taskName),
  ]
);

export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
