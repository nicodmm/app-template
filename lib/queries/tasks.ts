import { db } from "@/lib/drizzle/db";
import { tasks, transcripts, users } from "@/lib/drizzle/schema";
import { eq, asc, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Task } from "@/lib/drizzle/schema";

export type { Task };

export type TaskWithContext = Task & {
  meetingDate: string | null;
  meetingCreatedAt: Date | null;
  meetingSummary: string | null;
  transcriptFileName: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
};

export async function getAccountTasks(accountId: string): Promise<TaskWithContext[]> {
  const assigneeUser = alias(users, "assignee_user");

  const rows = await db
    .select({
      task: tasks,
      meetingDate: transcripts.meetingDate,
      meetingCreatedAt: transcripts.createdAt,
      meetingSummary: transcripts.meetingSummary,
      transcriptFileName: transcripts.fileName,
      assigneeName: assigneeUser.fullName,
      assigneeEmail: assigneeUser.email,
    })
    .from(tasks)
    .leftJoin(transcripts, eq(tasks.transcriptId, transcripts.id))
    .leftJoin(assigneeUser, eq(tasks.assigneeId, assigneeUser.id))
    .where(eq(tasks.accountId, accountId))
    .orderBy(desc(transcripts.meetingDate), desc(transcripts.createdAt), asc(tasks.priority));

  return rows.map((r) => ({
    ...r.task,
    meetingDate: r.meetingDate ?? null,
    meetingCreatedAt: r.meetingCreatedAt ?? null,
    meetingSummary: r.meetingSummary ?? null,
    transcriptFileName: r.transcriptFileName ?? null,
    assigneeName: r.assigneeName ?? null,
    assigneeEmail: r.assigneeEmail ?? null,
  }));
}
