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
  taskProjects,
  taskProjectMembers,
} from "@/lib/drizzle/schema";
import { eq, and, asc, desc, sql, inArray, isNull, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
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

async function kanbanTasksByWhere(where: SQL): Promise<KanbanTask[]> {
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
    .where(where)
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

export async function getAccountKanbanTasks(
  accountId: string
): Promise<KanbanTask[]> {
  return kanbanTasksByWhere(eq(tasks.accountId, accountId));
}

export async function getProjectKanbanTasks(
  projectId: string
): Promise<KanbanTask[]> {
  return kanbanTasksByWhere(eq(tasks.projectId, projectId));
}

/** Tareas sueltas (sin cuenta ni proyecto) visibles por el usuario. */
export async function getLooseKanbanTasks(
  userId: string,
  workspaceId: string
): Promise<KanbanTask[]> {
  const where = and(
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.accountId),
    isNull(tasks.projectId),
    or(eq(tasks.createdBy, userId), eq(tasks.assigneeId, userId))
  ) as SQL;
  return kanbanTasksByWhere(where);
}

export type ContainerKind = "account" | "project" | "loose";

export interface GlobalTask {
  id: string;
  containerKind: ContainerKind;
  containerId: string | null; // null para loose
  containerName: string; // nombre de cuenta/proyecto o "Tareas Sueltas"
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

/**
 * Todas las tareas top-level accesibles para la vista global: cuentas accesibles
 * + proyectos donde es miembro + sus tareas sueltas. Una sola query con leftJoins.
 */
export async function getGlobalTasks(params: {
  userId: string;
  workspaceId: string;
  accountIds: string[];
  projectIds: string[];
}): Promise<GlobalTask[]> {
  const { userId, workspaceId, accountIds, projectIds } = params;
  const assigneeUser = alias(users, "assignee_user_global");

  const conditions: SQL[] = [];
  if (accountIds.length > 0)
    conditions.push(inArray(tasks.accountId, accountIds) as SQL);
  if (projectIds.length > 0)
    conditions.push(inArray(tasks.projectId, projectIds) as SQL);
  conditions.push(
    and(
      isNull(tasks.accountId),
      isNull(tasks.projectId),
      or(eq(tasks.createdBy, userId), eq(tasks.assigneeId, userId))
    ) as SQL
  );

  const rows = await db
    .select({
      id: tasks.id,
      accountId: tasks.accountId,
      projectId: tasks.projectId,
      accountName: accounts.name,
      projectName: taskProjects.name,
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
    .leftJoin(accounts, eq(accounts.id, tasks.accountId))
    .leftJoin(taskProjects, eq(taskProjects.id, tasks.projectId))
    .leftJoin(assigneeUser, eq(tasks.assigneeId, assigneeUser.id))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.parentTaskId),
        or(...conditions)
      )
    )
    .orderBy(asc(tasks.sortOrder), asc(tasks.priority));

  return rows.map((r) => {
    const kind: ContainerKind = r.accountId
      ? "account"
      : r.projectId
      ? "project"
      : "loose";
    return {
      id: r.id,
      containerKind: kind,
      containerId: r.accountId ?? r.projectId ?? null,
      containerName:
        kind === "account"
          ? r.accountName ?? "Cuenta"
          : kind === "project"
          ? r.projectName ?? "Proyecto"
          : "Tareas Sueltas",
      title: r.title,
      description: r.description,
      column: normalizeColumn(r.status),
      priority: r.priority,
      dueDate: r.dueDate ?? null,
      isPublic: r.isPublic,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName ?? null,
      mentionCount: Number(r.mentionCount ?? 0),
    };
  });
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

export async function listWorkspaceTaskLabels(
  workspaceId: string
): Promise<TaskLabel[]> {
  const rows = await db
    .select({ id: taskLabels.id, name: taskLabels.name, color: taskLabels.color })
    .from(taskLabels)
    .where(eq(taskLabels.workspaceId, workspaceId))
    .orderBy(asc(taskLabels.name));
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}

export interface ProjectSummary {
  id: string;
  name: string;
  color: string | null;
  taskCount: number;
}

/** Proyectos donde el usuario es miembro (no archivados) + conteo de tareas top-level. */
export async function getUserProjects(
  userId: string,
  workspaceId: string
): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: taskProjects.id,
      name: taskProjects.name,
      color: taskProjects.color,
      taskCount: sql<number>`(
        select count(*) from ${tasks}
        where ${tasks.projectId} = ${taskProjects.id}
          and ${tasks.parentTaskId} is null
      )`,
    })
    .from(taskProjectMembers)
    .innerJoin(taskProjects, eq(taskProjects.id, taskProjectMembers.projectId))
    .where(
      and(
        eq(taskProjectMembers.userId, userId),
        eq(taskProjects.workspaceId, workspaceId),
        isNull(taskProjects.archivedAt)
      )
    )
    .orderBy(asc(taskProjects.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color ?? null,
    taskCount: Number(r.taskCount ?? 0),
  }));
}

export interface AccountSummary {
  id: string;
  name: string;
  taskCount: number;
}

/** Cuentas accesibles + conteo de tareas top-level (se muestran como proyectos). */
export async function getAccountSummaries(
  accountIds: string[]
): Promise<AccountSummary[]> {
  if (accountIds.length === 0) return [];
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      taskCount: sql<number>`(
        select count(*) from ${tasks}
        where ${tasks.accountId} = ${accounts.id}
          and ${tasks.parentTaskId} is null
      )`,
    })
    .from(accounts)
    .where(inArray(accounts.id, accountIds))
    .orderBy(asc(accounts.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    taskCount: Number(r.taskCount ?? 0),
  }));
}

export interface ScopeMoveTargets {
  accounts: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}

/** Destinos a los que el usuario puede MOVER una tarea (cuentas + proyectos accesibles). */
export async function getScopeMoveTargets(
  accountIds: string[],
  projectIds: string[]
): Promise<ScopeMoveTargets> {
  const [accountRows, projectRows] = await Promise.all([
    accountIds.length > 0
      ? db
          .select({ id: accounts.id, name: accounts.name })
          .from(accounts)
          .where(inArray(accounts.id, accountIds))
          .orderBy(accounts.name)
      : Promise.resolve([]),
    projectIds.length > 0
      ? db
          .select({ id: taskProjects.id, name: taskProjects.name })
          .from(taskProjects)
          .where(inArray(taskProjects.id, projectIds))
          .orderBy(taskProjects.name)
      : Promise.resolve([]),
  ]);
  return { accounts: accountRows, projects: projectRows };
}
