import { db } from "@/lib/drizzle/db";
import { participants, transcripts } from "@/lib/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Participant } from "@/lib/drizzle/schema";

export type { Participant };

export type ParticipantWithContext = Participant & {
  firstTranscriptFileName: string | null;
  firstMeetingDate: string | null;
  lastTranscriptFileName: string | null;
  lastMeetingDate: string | null;
};

export async function getAccountParticipants(
  accountId: string
): Promise<ParticipantWithContext[]> {
  const firstT = alias(transcripts, "first_t");
  const lastT = alias(transcripts, "last_t");

  const rows = await db
    .select({
      participant: participants,
      firstFileName: firstT.fileName,
      firstMeetingDate: firstT.meetingDate,
      lastFileName: lastT.fileName,
      lastMeetingDate: lastT.meetingDate,
    })
    .from(participants)
    .leftJoin(firstT, eq(participants.firstTranscriptId, firstT.id))
    .leftJoin(lastT, eq(participants.lastTranscriptId, lastT.id))
    .where(eq(participants.accountId, accountId))
    .orderBy(desc(participants.lastSeenAt), desc(participants.appearanceCount));

  return rows.map((r) => ({
    ...r.participant,
    firstTranscriptFileName: r.firstFileName ?? null,
    firstMeetingDate: r.firstMeetingDate ?? null,
    lastTranscriptFileName: r.lastFileName ?? null,
    lastMeetingDate: r.lastMeetingDate ?? null,
  }));
}
