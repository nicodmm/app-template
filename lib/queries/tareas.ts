import { db } from "@/lib/drizzle/db";
import {
  tasks,
  transcripts,
  users,
  taskMeetingMentions,
} from "@/lib/drizzle/schema";
import { eq, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Task } from "@/lib/drizzle/schema";
import { normalizeColumn, type TareaColumnKey } from "@/lib/tareas/columns";

export type KanbanTask = Task & {
  column: TareaColumnKey;
  meetingDate: string | null;
  meetingCreatedAt: Date | null;
  transcriptFileName: string | null;
  assigneeName: string | null;
  mentionCount: number;
};

export async function getAccountKanbanTasks(
  accountId: string
): Promise<KanbanTask[]> {
  const assigneeUser = alias(users, "assignee_user");

  const rows = await db
    .select({
      task: tasks,
      meetingDate: transcripts.meetingDate,
      meetingCreatedAt: transcripts.createdAt,
      transcriptFileName: transcripts.fileName,
      assigneeName: assigneeUser.fullName,
      mentionCount: sql<number>`(
        select count(*) from ${taskMeetingMentions}
        where ${taskMeetingMentions.taskId} = ${tasks.id}
      )`,
    })
    .from(tasks)
    .leftJoin(transcripts, eq(tasks.transcriptId, transcripts.id))
    .leftJoin(assigneeUser, eq(tasks.assigneeId, assigneeUser.id))
    .where(eq(tasks.accountId, accountId))
    .orderBy(asc(tasks.sortOrder), asc(tasks.priority));

  return rows.map((r) => ({
    ...r.task,
    column: normalizeColumn(r.task.status),
    meetingDate: r.meetingDate ?? null,
    meetingCreatedAt: r.meetingCreatedAt ?? null,
    transcriptFileName: r.transcriptFileName ?? null,
    assigneeName: r.assigneeName ?? null,
    mentionCount: Number(r.mentionCount ?? 0),
  }));
}
