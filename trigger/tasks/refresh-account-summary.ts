import { task, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/drizzle/db";
import { accounts, transcripts } from "@/lib/drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { runAccountSummaryGeneration } from "@/lib/ai/account-summary";

interface RefreshAccountSummaryInput {
  accountId: string;
  workspaceId: string;
}

export const refreshAccountSummary = task({
  id: "refresh-account-summary",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 8000, factor: 2 },
  run: async (payload: RefreshAccountSummaryInput): Promise<void> => {
    // Find a transcript whose content we can use as the "current snapshot".
    // Prefer the latest completed one; fall back to latest of any status.
    const [completed] = await db
      .select({ id: transcripts.id, content: transcripts.content })
      .from(transcripts)
      .where(
        and(
          eq(transcripts.accountId, payload.accountId),
          eq(transcripts.status, "completed")
        )
      )
      .orderBy(desc(transcripts.meetingDate), desc(transcripts.createdAt))
      .limit(1);

    let baseTranscript = completed;
    if (!baseTranscript) {
      const [anyT] = await db
        .select({ id: transcripts.id, content: transcripts.content })
        .from(transcripts)
        .where(eq(transcripts.accountId, payload.accountId))
        .orderBy(desc(transcripts.createdAt))
        .limit(1);
      baseTranscript = anyT;
    }

    if (!baseTranscript) {
      logger.info("Skipping refresh — no transcripts on account", {
        accountId: payload.accountId,
      });
      return;
    }

    const parsed = await runAccountSummaryGeneration({
      accountId: payload.accountId,
      workspaceId: payload.workspaceId,
      transcriptId: baseTranscript.id,
      cleanedContent: baseTranscript.content,
    });

    await db
      .update(accounts)
      .set({
        aiSummary: parsed.accountSituation,
        aiSummaryUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, payload.accountId));

    logger.info("Account summary refreshed", { accountId: payload.accountId });
  },
});
