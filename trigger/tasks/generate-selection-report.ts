import { task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { selectionCandidates, selectionSearches } from "@/lib/drizzle/schema";
import { logLlmUsage } from "@/lib/ai/log-usage";
import {
  SELECTION_REPORT_SYSTEM,
  buildReportUserMessage,
} from "@/lib/ai/selection-report-prompt";
import { resolveCvText } from "@/lib/selection/extract-cv-text-server";

const MODEL = "claude-haiku-4-5-20251001";
const anthropic = new Anthropic();

interface Input {
  candidateId: string;
  workspaceId: string;
}

export const generateSelectionReport = task({
  id: "generate-selection-report",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 5000, factor: 2 },
  run: async (payload: Input): Promise<{ status: string }> => {
    const [c] = await db
      .select()
      .from(selectionCandidates)
      .where(eq(selectionCandidates.id, payload.candidateId))
      .limit(1);
    if (!c) {
      logger.warn("Candidate gone — skipping report", { id: payload.candidateId });
      return { status: "skipped" };
    }
    const [search] = await db
      .select()
      .from(selectionSearches)
      .where(eq(selectionSearches.id, c.searchId))
      .limit(1);

    try {
      // CVs subidos como archivo traen texto extraído en el cliente; los CV por
      // URL (ej. Drive) no, así que acá lo bajamos y extraemos server-side.
      const cvText = await resolveCvText({
        cvStoragePath: c.cvStoragePath,
        cvUrl: c.cvUrl,
        cvExtractedText: c.cvExtractedText,
      });

      // Persistir el texto extraído si lo conseguimos por primera vez.
      if (cvText && cvText !== c.cvExtractedText) {
        await db
          .update(selectionCandidates)
          .set({ cvExtractedText: cvText, updatedAt: new Date() })
          .where(eq(selectionCandidates.id, payload.candidateId));
      }

      const userMsg = buildReportUserMessage({
        candidateName: `${c.firstName} ${c.lastName}`,
        position: search?.position ?? "",
        positionDescription: search?.positionDescription ?? null,
        cvText,
        recruiterNotes: c.recruiterNotes,
        linkedinUrl: c.linkedinUrl,
        expectedSalary: c.expectedSalary,
        currentSalary: c.currentSalary,
      });

      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SELECTION_REPORT_SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      });

      const text = resp.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("\n")
        .trim();

      await logLlmUsage({
        workspaceId: payload.workspaceId,
        accountId: c.accountId,
        taskName: "generate-selection-report",
        model: MODEL,
        usage: resp.usage,
      });

      await db
        .update(selectionCandidates)
        .set({
          reportContent: text,
          reportStatus: "ready",
          reportError: null,
          reportGeneratedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(selectionCandidates.id, payload.candidateId));

      return { status: "ready" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error generando informe";
      await db
        .update(selectionCandidates)
        .set({ reportStatus: "error", reportError: msg })
        .where(eq(selectionCandidates.id, payload.candidateId));
      throw err;
    }
  },
});
