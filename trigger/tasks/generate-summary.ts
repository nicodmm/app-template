import { task, metadata } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/drizzle/db";
import { transcripts } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { runAccountSummaryGeneration } from "@/lib/ai/account-summary";

interface GenerateSummaryInput {
  transcriptId: string;
  accountId: string;
  workspaceId: string;
  cleanedContent: string;
}

interface GenerateSummaryOutput {
  meetingSummary: string;
  accountSituation: string;
}

export const generateSummary = task({
  id: "generate-summary",
  retry: { maxAttempts: 2 },
  run: async (payload: GenerateSummaryInput): Promise<GenerateSummaryOutput> => {
    await metadata.root.set("progress", 55);
    await metadata.root.set("currentStep", "Generando resumen...");

    const parsed = await runAccountSummaryGeneration({
      accountId: payload.accountId,
      transcriptId: payload.transcriptId,
      cleanedContent: payload.cleanedContent,
    });

    await db
      .update(transcripts)
      .set({ meetingSummary: parsed.meetingSummary, updatedAt: new Date() })
      .where(eq(transcripts.id, payload.transcriptId));

    await metadata.root.set("progress", 65);
    await metadata.root.set("currentStep", "Resumen generado");

    return parsed;
  },
});
