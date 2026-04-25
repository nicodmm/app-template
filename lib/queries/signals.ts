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

export type WeeklyHealthBucket = {
  /** Monday of the week, ISO date string (YYYY-MM-DD). */
  weekStart: string;
  /** Dominant signal that week. null = no data yet (oldest weeks if account is new). */
  signal: "green" | "yellow" | "red" | "inactive" | null;
  /** True when the entry the week is based on is older than the week itself
   *  (i.e. carried forward from a prior week's signal). Lets the UI dim the cell. */
  carryForward: boolean;
};

/**
 * Returns `weeks` weekly buckets oldest → newest for the strip chart.
 * Logic: for each week, take the latest health entry whose effective date
 * (meeting date if available, otherwise createdAt) falls in that week. If
 * none, carry forward the most recent signal seen in any prior week. If
 * there is no prior signal at all, the bucket's signal is null.
 */
export async function getWeeklyHealthSparkline(
  accountId: string,
  weeks = 12
): Promise<WeeklyHealthBucket[]> {
  // Pull the full history once, sorted oldest first.
  const rows = await db
    .select({
      healthSignal: accountHealthHistory.healthSignal,
      createdAt: accountHealthHistory.createdAt,
      meetingDate: transcripts.meetingDate,
    })
    .from(accountHealthHistory)
    .leftJoin(transcripts, eq(accountHealthHistory.transcriptId, transcripts.id))
    .where(eq(accountHealthHistory.accountId, accountId))
    .orderBy(accountHealthHistory.createdAt);

  const events = rows.map((r) => {
    const md = r.meetingDate ? new Date(r.meetingDate) : null;
    return {
      at: md ?? r.createdAt,
      signal: r.healthSignal as WeeklyHealthBucket["signal"],
    };
  });

  // Build week buckets: today → 11 weeks back, week starting on Monday.
  const buckets: WeeklyHealthBucket[] = [];
  const today = new Date();
  // Locate this week's Monday in local time.
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=Mon ... 6=Sun
  const thisMonday = new Date(today);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() - dayOfWeek);

  let cursor = 0;
  let lastSignal: WeeklyHealthBucket["signal"] | null = null;

  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(weekStart.getDate() - w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let weekSignal: WeeklyHealthBucket["signal"] | null = null;
    while (cursor < events.length && events[cursor].at < weekEnd) {
      if (events[cursor].at >= weekStart) {
        weekSignal = events[cursor].signal;
      } else {
        lastSignal = events[cursor].signal;
      }
      cursor += 1;
    }

    if (weekSignal !== null) {
      lastSignal = weekSignal;
      buckets.push({
        weekStart: weekStart.toISOString().slice(0, 10),
        signal: weekSignal,
        carryForward: false,
      });
    } else {
      buckets.push({
        weekStart: weekStart.toISOString().slice(0, 10),
        signal: lastSignal,
        carryForward: lastSignal !== null,
      });
    }
  }

  return buckets;
}
