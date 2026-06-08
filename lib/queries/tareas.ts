import { db } from "@/lib/drizzle/db";
import {
  tasks,
  transcripts,
  users,
  taskMeetingMentions,
  taskLabels,
  taskLabelAssignments,
  taskComments,
  taskCommentMentions,
  taskAttachments,
  accounts,
} from "@/lib/drizzle/schema";
import { eq, and, asc, desc, sql, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Task, TaskAttachment } from "@/lib/drizzle/schema";
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
  commentCount: number;
  attachmentCount: number;
  labels: TaskLabel[];
};

export interface TaskCommentView {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  mentionedUserIds: string[];
}

export interface TaskThread {
  comments: TaskCommentView[];
  attachments: TaskAttachment[];
}

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
      commentCount: sql<number>`(
        select count(*) from ${taskComments}
        where ${taskComments.taskId} = ${tasks.id}
      )`,
      attachmentCount: sql<number>`(
        select count(*) from ${taskAttachments}
        where ${taskAttachments.taskId} = ${tasks.id}
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
    commentCount: Number(r.commentCount ?? 0),
    attachmentCount: Number(r.attachmentCount ?? 0),
    labels: labelsByTask.get(r.task.id) ?? [],
  }));
}

export interface GlobalTask {
  id: string;
  accountId: string;
  accountName: string;
  title: string | null;
  description: string;
  column: TareaColumnKey;
  priority: number;
  dueDate: string | null;
  isPublic: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  mentionCount: number;
}

/** Tareas top-level de todas las cuentas accesibles, para la vista global. */
export async function getGlobalTasks(
  accountIds: string[]
): Promise<GlobalTask[]> {
  if (accountIds.length === 0) return [];
  const assigneeUser = alias(users, "assignee_user_global");

  const rows = await db
    .select({
      id: tasks.id,
      accountId: tasks.accountId,
      accountName: accounts.name,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      isPublic: tasks.isPublic,
      assigneeId: tasks.assigneeId,
      assigneeName: assigneeUser.fullName,
      mentionCount: sql<number>`(
        select count(*) from ${taskMeetingMentions}
        where ${taskMeetingMentions.taskId} = ${tasks.id}
      )`,
    })
    .from(tasks)
    .innerJoin(accounts, eq(accounts.id, tasks.accountId))
    .leftJoin(assigneeUser, eq(tasks.assigneeId, assigneeUser.id))
    .where(and(inArray(tasks.accountId, accountIds), isNull(tasks.parentTaskId)))
    .orderBy(asc(tasks.sortOrder), asc(tasks.priority));

  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: r.accountName,
    title: r.title,
    description: r.description,
    column: normalizeColumn(r.status),
    priority: r.priority,
    dueDate: r.dueDate ?? null,
    isPublic: r.isPublic,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeName ?? null,
    mentionCount: Number(r.mentionCount ?? 0),
  }));
}

/** Comentarios (con autor + menciones) y adjuntos de una tarea. */
export async function getTaskThread(taskId: string): Promise<TaskThread> {
  const commentRows = await db
    .select({
      id: taskComments.id,
      body: taskComments.body,
      authorId: taskComments.authorId,
      authorName: users.fullName,
      createdAt: taskComments.createdAt,
    })
    .from(taskComments)
    .leftJoin(users, eq(users.id, taskComments.authorId))
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt));

  const commentIds = commentRows.map((c) => c.id);
  const mentionRows =
    commentIds.length > 0
      ? await db
          .select({
            commentId: taskCommentMentions.commentId,
            mentionedUserId: taskCommentMentions.mentionedUserId,
          })
          .from(taskCommentMentions)
          .where(inArray(taskCommentMentions.commentId, commentIds))
      : [];

  const mentionsByComment = new Map<string, string[]>();
  for (const m of mentionRows) {
    const arr = mentionsByComment.get(m.commentId) ?? [];
    arr.push(m.mentionedUserId);
    mentionsByComment.set(m.commentId, arr);
  }

  const attachments = await db
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.taskId, taskId))
    .orderBy(desc(taskAttachments.createdAt));

  return {
    comments: commentRows.map((c) => ({
      id: c.id,
      body: c.body,
      authorId: c.authorId,
      authorName: c.authorName ?? null,
      createdAt: c.createdAt,
      mentionedUserIds: mentionsByComment.get(c.id) ?? [],
    })),
    attachments,
  };
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
