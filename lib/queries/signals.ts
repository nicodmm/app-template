import { db } from "@/lib/drizzle/db";
import { signals, accountHealthHistory, transcripts, users } from "@/lib/drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";
import type { Signal } from "@/lib/drizzle/schema";

export type { Signal };

export type SignalWithContext = Signal & {
  meetingDate: string | null;
  transcriptFileName: string | null;
  resolvedByName: string | null;
};

export async function getAccountSignals(accountId: string): Promise<SignalWithContext[]> {
  const rows = await db
    .select({
      signal: signals,
      meetingDate: transcripts.meetingDate,
      transcriptFileName: transcripts.fileName,
      resolvedByName: users.fullName,
    })
    .from(signals)
    .leftJoin(transcripts, eq(signals.transcriptId, transcripts.id))
    .leftJoin(users, eq(signals.resolvedBy, users.id))
    .where(eq(signals.accountId, accountId))
    .orderBy(desc(signals.createdAt));

  return rows.map((r) => ({
    ...r.signal,
    meetingDate: r.meetingDate ?? null,
    transcriptFileName: r.transcriptFileName ?? null,
    resolvedByName: r.resolvedByName ?? null,
  }));
}

export type HealthHistoryEntry = {
  id: string;
  healthSignal: string;
  justification: string | null;
  createdAt: Date;
  meetingDate: string | null;
  transcriptFileName: string | null;
};

export async function getAccountHealthHistory(
  accountId: string,
  limit = 50
): Promise<HealthHistoryEntry[]> {
  const rows = await db
    .select({
      id: accountHealthHistory.id,
      healthSignal: accountHealthHistory.healthSignal,
      justification: accountHealthHistory.justification,
      createdAt: accountHealthHistory.createdAt,
      meetingDate: transcripts.meetingDate,
      transcriptFileName: transcripts.fileName,
    })
    .from(accountHealthHistory)
    .leftJoin(transcripts, eq(accountHealthHistory.transcriptId, transcripts.id))
    .where(eq(accountHealthHistory.accountId, accountId))
    .orderBy(
      sql`${transcripts.meetingDate} DESC NULLS LAST`,
      desc(accountHealthHistory.createdAt)
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    healthSignal: r.healthSignal,
    justification: r.justification,
    createdAt: r.createdAt,
    meetingDate: r.meetingDate ?? null,
    transcriptFileName: r.transcriptFileName ?? null,
  }));
}
