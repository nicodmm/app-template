import { db } from "@/lib/drizzle/db";
import { transcripts } from "@/lib/drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
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
