import { db } from "@/lib/drizzle/db";
import {
  tasks,
  transcripts,
  users,
  taskMeetingMentions,
  taskLabels,
  taskLabelAssignments,
  accounts,
} from "@/lib/drizzle/schema";
import { eq, asc, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Task } from "@/lib/drizzle/schema";
import { normalizeColumn, type TareaColumnKey } from "@/lib/tareas/columns";

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

export type KanbanTask = Task & {
  column: TareaColumnKey;
  meetingDate: string | null;
  meetingCreatedAt: Date | null;
  transcriptFileName: string | null;
  assigneeName: string | null;
  mentionCount: number;
  labels: TaskLabel[];
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

  const taskIds = rows.map((r) => r.task.id);
  const labelRows =
    taskIds.length > 0
      ? await db
          .select({
            taskId: taskLabelAssignments.taskId,
            id: taskLabels.id,
            name: taskLabels.name,
            color: taskLabels.color,
          })
          .from(taskLabelAssignments)
          .innerJoin(taskLabels, eq(taskLabelAssignments.labelId, taskLabels.id))
          .where(inArray(taskLabelAssignments.taskId, taskIds))
      : [];

  const labelsByTask = new Map<string, TaskLabel[]>();
  for (const l of labelRows) {
    const arr = labelsByTask.get(l.taskId) ?? [];
    arr.push({ id: l.id, name: l.name, color: l.color });
    labelsByTask.set(l.taskId, arr);
  }

  return rows.map((r) => ({
    ...r.task,
    column: normalizeColumn(r.task.status),
    meetingDate: r.meetingDate ?? null,
    meetingCreatedAt: r.meetingCreatedAt ?? null,
    transcriptFileName: r.transcriptFileName ?? null,
    assigneeName: r.assigneeName ?? null,
    mentionCount: Number(r.mentionCount ?? 0),
    labels: labelsByTask.get(r.task.id) ?? [],
  }));
}

export async function listAccountTaskLabels(
  accountId: string
): Promise<TaskLabel[]> {
  const [acc] = await db
    .select({ workspaceId: accounts.workspaceId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!acc) return [];
  const rows = await db
    .select({ id: taskLabels.id, name: taskLabels.name, color: taskLabels.color })
    .from(taskLabels)
    .where(eq(taskLabels.workspaceId, acc.workspaceId))
    .orderBy(asc(taskLabels.name));
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}
