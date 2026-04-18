import { task, metadata } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/drizzle/db";
import { transcripts } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";

interface PrepareInput {
  transcriptId: string;
  content: string;
  accountId: string;
}

interface PrepareOutput {
  cleanedContent: string;
  wordCount: number;
}

// Attempt to extract a YYYY-MM-DD meeting date from the transcript content.
// Handles English formats like "Mar 31, 2026", Spanish "21 de enero de 2024", ISO, etc.
function extractMeetingDate(content: string): string | null {
  const MONTHS_ES: Record<string, string> = {
    enero: "01", febrero: "02", marzo: "03", abril: "04",
    mayo: "05", junio: "06", julio: "07", agosto: "08",
    septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
  };
  const MONTHS_EN: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    january: "01", february: "02", march: "03", april: "04",
    june: "06", july: "07", august: "08", september: "09",
    october: "10", november: "11", december: "12",
  };

  // "Meeting started: Mar 31, 2026" / "Jan 21, 2025" / "March 31, 2026"
  const engMDY = content.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i
  );
  if (engMDY) {
    const [, m, d, y] = engMDY;
    return `${y}-${MONTHS_EN[m.toLowerCase()]}-${d.padStart(2, "0")}`;
  }

  // "31 Mar 2026" / "31 March 2026"
  const engDMY = content.match(
    /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/i
  );
  if (engDMY) {
    const [, d, m, y] = engDMY;
    return `${y}-${MONTHS_EN[m.toLowerCase()]}-${d.padStart(2, "0")}`;
  }

  // Spanish "21 de enero de 2024"
  const esLong = content.match(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de)?\s+(\d{4})\b/i
  );
  if (esLong) {
    const [, d, m, y] = esLong;
    return `${y}-${MONTHS_ES[m.toLowerCase()]}-${d.padStart(2, "0")}`;
  }

  // ISO "2026-03-31"
  const iso = content.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (iso) return iso[0];

  // "31/03/2026" or "31-03-2026"
  const dmy = content.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

export const prepareTranscript = task({
  id: "prepare-transcript",
  retry: { maxAttempts: 1 },
  run: async (payload: PrepareInput): Promise<PrepareOutput> => {
    await metadata.root.set("progress", 5);
    await metadata.root.set("currentStep", "Procesando texto...");

    await db
      .update(transcripts)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(transcripts.id, payload.transcriptId));

    const cleanedContent = payload.content.trim().replace(/\s+/g, " ");
    const wordCount = cleanedContent.split(/\s+/).length;
    const meetingDate = extractMeetingDate(payload.content);

    await db
      .update(transcripts)
      .set({ wordCount, meetingDate, updatedAt: new Date() })
      .where(eq(transcripts.id, payload.transcriptId));

    await metadata.root.set("progress", 10);

    return { cleanedContent, wordCount };
  },
});
