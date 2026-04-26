import { db } from "@/lib/drizzle/db";
import { llmUsage } from "@/lib/drizzle/schema";

/**
 * Per-1M-token pricing in USD for the Anthropic models we call.
 * Add new entries here as we adopt other models. Numbers reflect Anthropic
 * public pricing as of 2026-04 — when prices change, update this map and
 * historical rows keep their old `cost_usd` (computed at log time).
 */
const PRICING: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  // Haiku 4.5 — primary model used across the trigger tasks.
  "claude-haiku-4-5-20251001": {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  // Newer aliases / fallbacks. If the SDK starts using a slightly different
  // model id, we still have a reasonable estimate instead of zero.
  "claude-haiku-4-5": {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-opus-4-7": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
};

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

interface LogParams {
  workspaceId: string | null;
  accountId: string | null;
  taskName: string;
  model: string;
  usage: AnthropicUsage | null | undefined;
}

function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number
): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  const PER_MILLION = 1_000_000;
  return (
    (inputTokens / PER_MILLION) * pricing.input +
    (outputTokens / PER_MILLION) * pricing.output +
    (cacheReadTokens / PER_MILLION) * pricing.cacheRead +
    (cacheWriteTokens / PER_MILLION) * pricing.cacheWrite
  );
}

/**
 * Persist a single Anthropic API call's usage. Best-effort — any DB error
 * is swallowed so the calling task never fails because of telemetry.
 */
export async function logLlmUsage(params: LogParams): Promise<void> {
  try {
    if (!params.usage) return;
    const inputTokens = params.usage.input_tokens ?? 0;
    const outputTokens = params.usage.output_tokens ?? 0;
    const cacheReadTokens = params.usage.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = params.usage.cache_creation_input_tokens ?? 0;
    const costUsd = computeCostUsd(
      params.model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens
    );

    await db.insert(llmUsage).values({
      workspaceId: params.workspaceId,
      accountId: params.accountId,
      taskName: params.taskName,
      model: params.model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd: costUsd.toFixed(6),
    });
  } catch (err) {
    // Telemetry MUST never break a task. Surface in logs only.
    console.error("[logLlmUsage] failed to persist usage", err);
  }
}
