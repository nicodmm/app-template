import { task, metadata, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { prepareTranscript } from "@/trigger/tasks/prepare-transcript";
import { extractParticipants } from "@/trigger/tasks/extract-participants";
import { extractTasks } from "@/trigger/tasks/extract-tasks";
import { generateSummary } from "@/trigger/tasks/generate-summary";
import { detectSignals } from "@/trigger/tasks/detect-signals";
import { finalizeTranscript } from "@/trigger/tasks/finalize-transcript";
import { db } from "@/lib/drizzle/db";
import { transcripts } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";

interface ProcessTranscriptInput {
  transcriptId: string;
  accountId: string;
  workspaceId: string;
  content: string;
}

export const processTranscript = task({
  id: "process-transcript",
  maxDuration: 300,
  run: async (payload: ProcessTranscriptInput): Promise<void> => {
    const { transcriptId, accountId, workspaceId, content } = payload;

    try {
      // 1. Prepare — normalize text, update status to processing
      const prepareResult = await prepareTranscript.triggerAndWait({
        transcriptId,
        content,
        accountId,
      });
      if (!prepareResult.ok) throw new AbortTaskRunError("prepare-transcript failed");
      const { cleanedContent } = prepareResult.output;

      // 2. Extract participants (sequential)
      await extractParticipants.triggerAndWait({
        transcriptId,
        accountId,
        workspaceId,
        cleanedContent,
      });

      // 3. Extract tasks (sequential — Promise.all not supported with triggerAndWait)
      await extractTasks.triggerAndWait({
        transcriptId,
        accountId,
        workspaceId,
        cleanedContent,
      });

      // 4. Generate summary
      const summaryResult = await generateSummary.triggerAndWait({
        transcriptId,
        accountId,
        workspaceId,
        cleanedContent,
      });

      const summaryOutput = summaryResult.ok
        ? summaryResult.output
        : { meetingSummary: "", accountSituation: "" };

      // 5. Detect signals (needs summary output)
      await detectSignals.triggerAndWait({
        transcriptId,
        accountId,
        workspaceId,
        summaryText: summaryOutput.meetingSummary,
        accountSituation: summaryOutput.accountSituation,
        adMetricsSnapshot: null,
      });

      // 6. Finalize
      await finalizeTranscript.triggerAndWait({
        transcriptId,
        accountId,
        workspaceId,
        accountSituation: summaryOutput.accountSituation,
      });
    } catch (err) {
      // Mark transcript as failed
      await db
        .update(transcripts)
        .set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Error desconocido",
          updatedAt: new Date(),
        })
        .where(eq(transcripts.id, transcriptId));

      await metadata.set("progress", 0);
      await metadata.set("currentStep", "Error en el procesamiento");
      throw err;
    }
  },
});
