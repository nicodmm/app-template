import { db } from "@/lib/drizzle/db";
import {
  workspaces,
  accounts,
  transcripts,
  contextDocuments,
} from "@/lib/drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface OnboardingState {
  steps: {
    agency: boolean;
    services: boolean;
    account: boolean;
    context: boolean;
  };
  /** Most recently created account id, or null when there are none. Used to deep-link step 4. */
  latestAccountId: string | null;
  completedCount: number;
  isComplete: boolean;
}

export async function getOnboardingState(
  workspaceId: string
): Promise<OnboardingState> {
  const [workspaceRow, accountRow, contextExistsRow] = await Promise.all([
    db
      .select({
        agencyContext: workspaces.agencyContext,
        services: workspaces.services,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.workspaceId, workspaceId))
      .orderBy(desc(accounts.createdAt))
      .limit(1),
    db
      .select({
        hasContext: sql<boolean>`EXISTS (
          SELECT 1 FROM ${transcripts} t
          INNER JOIN ${accounts} a ON a.id = t.account_id
          WHERE a.workspace_id = ${workspaceId}
          UNION ALL
          SELECT 1 FROM ${contextDocuments} c
          INNER JOIN ${accounts} a ON a.id = c.account_id
          WHERE a.workspace_id = ${workspaceId}
          LIMIT 1
        )`.as("has_context"),
      })
      .from(sql`(SELECT 1) AS dummy`),
  ]);

  const ws = workspaceRow[0];
  const agency = !!ws?.agencyContext?.trim();
  const services = (ws?.services?.length ?? 0) > 0;
  const latestAccountId = accountRow[0]?.id ?? null;
  const account = latestAccountId !== null;
  const context = !!contextExistsRow[0]?.hasContext;

  const steps = { agency, services, account, context };
  const completedCount = Object.values(steps).filter(Boolean).length;

  return {
    steps,
    latestAccountId,
    completedCount,
    isComplete: completedCount === 4,
  };
}
