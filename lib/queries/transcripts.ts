import { db } from "@/lib/drizzle/db";
import { transcripts } from "@/lib/drizzle/schema";
import { eq, and, desc, isNotNull, sql } from "drizzle-orm";
import type { Transcript } from "@/lib/drizzle/schema";

export async function getTranscriptHistory(
  accountId: string,
  limit = 10
): Promise<Transcript[]> {
  return db
    .select()
    .from(transcripts)
    .where(eq(transcripts.accountId, accountId))
    .orderBy(desc(transcripts.createdAt))
    .limit(limit);
}

export type LatestMeetingSummary = {
  transcriptId: string;
  fileName: string | null;
  meetingDate: string | null;
  createdAt: Date;
  meetingSummary: string;
};

/**
 * Returns the most recent completed transcript that has a meetingSummary.
 * Used by the account detail page to show a "last meeting" card without
 * forcing the user to open the full transcripts list.
 */
export async function getLatestMeetingSummary(
  accountId: string
): Promise<LatestMeetingSummary | null> {
  const rows = await db
    .select({
      transcriptId: transcripts.id,
      fileName: transcripts.fileName,
      meetingDate: transcripts.meetingDate,
      createdAt: transcripts.createdAt,
      meetingSummary: transcripts.meetingSummary,
    })
    .from(transcripts)
    .where(
      and(
        eq(transcripts.accountId, accountId),
        isNotNull(transcripts.meetingSummary)
      )
    )
    .orderBy(
      sql`${transcripts.meetingDate} DESC NULLS LAST`,
      desc(transcripts.createdAt)
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.meetingSummary) return null;
  return {
    transcriptId: row.transcriptId,
    fileName: row.fileName,
    meetingDate: row.meetingDate,
    createdAt: row.createdAt,
    meetingSummary: row.meetingSummary,
  };
}

export async function getTranscriptByHash(
  accountId: string,
  hash: string
): Promise<Transcript | null> {
  const rows = await db
    .select()
    .from(transcripts)
    .where(and(eq(transcripts.accountId, accountId), eq(transcripts.contentHash, hash)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTranscriptById(
  transcriptId: string,
  accountId: string
): Promise<Transcript | null> {
  const rows = await db
    .select()
    .from(transcripts)
    .where(and(eq(transcripts.id, transcriptId), eq(transcripts.accountId, accountId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveJob(accountId: string): Promise<Transcript | null> {
  const rows = await db
    .select()
    .from(transcripts)
    .where(
      and(
        eq(transcripts.accountId, accountId),
        eq(transcripts.status, "processing")
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
