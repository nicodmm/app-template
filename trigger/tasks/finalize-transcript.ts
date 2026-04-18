import { task, metadata } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/drizzle/db";
import { transcripts, accounts, usageTracking } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";

interface FinalizeInput {
  transcriptId: string;
  accountId: string;
  workspaceId: string;
  accountSituation: string;
}

export const finalizeTranscript = task({
  id: "finalize-transcript",
  retry: { maxAttempts: 3 },
  run: async (payload: FinalizeInput): Promise<void> => {
    await metadata.root.set("progress", 92);
    await metadata.root.set("currentStep", "Finalizando...");

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const rows = await db
      .select({ wordCount: transcripts.wordCount, meetingSummary: transcripts.meetingSummary })
      .from(transcripts)
      .where(eq(transcripts.id, payload.transcriptId))
      .limit(1);

    const transcript = rows[0];

    // Mark transcript completed
    await db
      .update(transcripts)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(eq(transcripts.id, payload.transcriptId));

    // Use accountSituation (holistic), fall back to meetingSummary if empty
    const aiSummary =
      payload.accountSituation?.trim() ||
      transcript?.meetingSummary?.trim() ||
      null;

    await db
      .update(accounts)
      .set({
        lastActivityAt: now,
        aiSummary,
        aiSummaryUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(accounts.id, payload.accountId));

    // Upsert usage tracking
    await db
      .insert(usageTracking)
      .values({
        workspaceId: payload.workspaceId,
        month: monthStart,
        transcriptsCount: 1,
        wordsProcessed: transcript?.wordCount ?? 0,
      })
      .onConflictDoUpdate({
        target: [usageTracking.workspaceId, usageTracking.month],
        set: {
          wordsProcessed: usageTracking.wordsProcessed,
          updatedAt: now,
        },
      });

    await metadata.root.set("progress", 100);
    await metadata.root.set("currentStep", "¡Listo!");
  },
});
