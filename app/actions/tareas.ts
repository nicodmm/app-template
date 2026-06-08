"use server";

import { db } from "@/lib/drizzle/db";
import {
  tasks,
  taskLabels,
  taskLabelAssignments,
  taskComments,
  taskCommentMentions,
  taskAttachments,
  notifications,
  users,
  workspaceMembers,
} from "@/lib/drizzle/schema";
import { and, eq, sql, inArray } from "drizzle-orm";
import { isLabelColor } from "@/lib/tareas/labels";
import type {
  TaskLabel,
  TaskThread,
  TaskCommentView,
} from "@/lib/queries/tareas";
import { getTaskThread } from "@/lib/queries/tareas";
import type { TaskAttachment } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  canAccessAccountTasks,
  getTaskAccessibleAccountIds,
} from "@/lib/queries/task-access";
import {
  TAREA_COLUMN_KEYS,
  isDoneColumn,
  type TareaColumnKey,
} from "@/lib/tareas/columns";
import { revalidatePath } from "next/cache";

async function authorize(accountId: string): Promise<{ workspaceId: string; userId: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const ok = await canAccessAccountTasks(userId, workspace.id, accountId);
  if (!ok) throw new Error("Sin acceso a las tareas de esta cuenta");
  return { workspaceId: workspace.id, userId };
}

function revalidate(accountId: string): void {
  revalidatePath(`/app/tareas/${accountId}`);
  revalidatePath("/app/tareas");
  revalidatePath(`/app/accounts/${accountId}`);
}

function isColumn(value: string): value is TareaColumnKey {
  return (TAREA_COLUMN_KEYS as string[]).includes(value);
}

export async function moveTask(
  taskId: string,
  accountId: string,
  toColumn: string,
  newSortOrder: number
): Promise<{ error?: string }> {
  const { workspaceId } = await authorize(accountId);
  if (!isColumn(toColumn)) return { error: "Columna inválida" };
  await db
    .update(tasks)
    .set({
      status: toColumn,
      sortOrder: newSortOrder,
      completedAt: isDoneColumn(toColumn) ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.accountId, accountId)));
  revalidate(accountId);
  return {};
}

export async function createKanbanTask(
  accountId: string,
  column: string,
  title: string,
  priority: number,
  assigneeId: string | null,
  dueDate: string | null
): Promise<{ id?: string; error?: string }> {
  const { workspaceId, userId } = await authorize(accountId);
  if (!isColumn(column)) return { error: "Columna inválida" };
  if (!title.trim()) return { error: "El título es requerido" };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${tasks.sortOrder}), 0)` })
    .from(tasks)
    .where(and(eq(tasks.accountId, accountId), eq(tasks.status, column)));

  const [created] = await db
    .insert(tasks)
    .values({
      accountId,
      workspaceId,
      createdBy: userId,
      assigneeId: assigneeId || null,
      title: title.trim(),
      description: "",
      priority,
      status: column,
      source: "manual",
      sortOrder: Number(maxOrder) + 1,
      dueDate: dueDate || null,
    })
    .returning({ id: tasks.id });
  revalidate(accountId);
  return { id: created.id };
}

export async function createSubtask(
  accountId: string,
  parentTaskId: string,
  title: string
): Promise<{ id?: string; error?: string }> {
  const { workspaceId, userId } = await authorize(accountId);
  if (!title.trim()) return { error: "El título es requerido" };
  if (!(await assertTaskInAccount(parentTaskId, accountId)))
    return { error: "Tarea padre no encontrada" };

  const [created] = await db
    .insert(tasks)
    .values({
      accountId,
      workspaceId,
      createdBy: userId,
      parentTaskId,
      title: title.trim(),
      description: "",
      priority: 3,
      status: "backlog",
      source: "manual",
      sortOrder: 0,
    })
    .returning({ id: tasks.id });
  revalidate(accountId);
  return { id: created.id };
}

export async function updateTaskFields(
  taskId: string,
  accountId: string,
  fields: {
    title?: string;
    description?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    isPublic?: boolean;
  }
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await authorize(accountId);

  // Estado previo (para detectar cambio real de responsable → notificar).
  const [before] = await db
    .select({
      assigneeId: tasks.assigneeId,
      title: tasks.title,
      description: tasks.description,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)))
    .limit(1);
  if (!before) return { error: "Tarea no encontrada" };

  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (fields.title !== undefined) patch.title = fields.title.trim() || null;
  if (fields.description !== undefined) {
    if (!fields.description.trim()) return { error: "La descripción es requerida" };
    patch.description = fields.description.trim();
  }
  if (fields.priority !== undefined) patch.priority = fields.priority;
  if (fields.assigneeId !== undefined) patch.assigneeId = fields.assigneeId || null;
  if (fields.dueDate !== undefined) patch.dueDate = fields.dueDate || null;
  if (fields.isPublic !== undefined) patch.isPublic = fields.isPublic;

  await db
    .update(tasks)
    .set(patch)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.accountId, accountId)));

  // Notificación de asignación: solo si el responsable cambió a otra persona
  // distinta del que hace la acción.
  const newAssignee = fields.assigneeId;
  if (
    newAssignee &&
    newAssignee !== before.assigneeId &&
    newAssignee !== userId
  ) {
    const [actor] = await db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const label = before.title || before.description || "una tarea";
    const snippet = label.length > 80 ? `${label.slice(0, 80)}…` : label;
    await db.insert(notifications).values({
      workspaceId,
      userId: newAssignee,
      type: "assignment",
      taskId,
      accountId,
      actorId: userId,
      body: `${actor?.name ?? "Alguien"} te asignó: "${snippet}"`,
    });
  }

  revalidate(accountId);
  return {};
}

export async function deleteKanbanTask(
  taskId: string,
  accountId: string
): Promise<{ error?: string }> {
  const { workspaceId } = await authorize(accountId);
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.accountId, accountId)));
  revalidate(accountId);
  return {};
}

export async function createLabel(
  accountId: string,
  name: string,
  color: string
): Promise<{ label?: TaskLabel; error?: string }> {
  const { workspaceId } = await authorize(accountId);
  if (!name.trim()) return { error: "El nombre es requerido" };
  if (!isLabelColor(color)) return { error: "Color inválido" };
  const [created] = await db
    .insert(taskLabels)
    .values({ workspaceId, name: name.trim(), color })
    .returning({ id: taskLabels.id, name: taskLabels.name, color: taskLabels.color });
  revalidate(accountId);
  return { label: { id: created.id, name: created.name, color: created.color } };
}

/** Verifica que la tarea pertenezca a la cuenta autorizada. */
async function assertTaskInAccount(taskId: string, accountId: string): Promise<boolean> {
  const [t] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)))
    .limit(1);
  return !!t;
}

export async function assignLabel(
  taskId: string,
  accountId: string,
  labelId: string
): Promise<{ error?: string }> {
  const { workspaceId } = await authorize(accountId);
  if (!(await assertTaskInAccount(taskId, accountId)))
    return { error: "Tarea no encontrada" };
  // La etiqueta debe pertenecer al workspace de la cuenta.
  const [lbl] = await db
    .select({ id: taskLabels.id })
    .from(taskLabels)
    .where(and(eq(taskLabels.id, labelId), eq(taskLabels.workspaceId, workspaceId)))
    .limit(1);
  if (!lbl) return { error: "Etiqueta no encontrada" };
  await db
    .insert(taskLabelAssignments)
    .values({ taskId, labelId })
    .onConflictDoNothing();
  revalidate(accountId);
  return {};
}

export async function unassignLabel(
  taskId: string,
  accountId: string,
  labelId: string
): Promise<{ error?: string }> {
  await authorize(accountId);
  if (!(await assertTaskInAccount(taskId, accountId)))
    return { error: "Tarea no encontrada" };
  await db
    .delete(taskLabelAssignments)
    .where(
      and(
        eq(taskLabelAssignments.taskId, taskId),
        eq(taskLabelAssignments.labelId, labelId)
      )
    );
  revalidate(accountId);
  return {};
}

// ── Comentarios + @menciones + adjuntos (Fase 4) ─────────────────────────────

/** Carga el hilo (comentarios + adjuntos) de una tarea, con access-check. */
export async function loadTaskThread(
  taskId: string,
  accountId: string
): Promise<{ thread?: TaskThread; error?: string }> {
  await authorize(accountId);
  if (!(await assertTaskInAccount(taskId, accountId)))
    return { error: "Tarea no encontrada" };
  return { thread: await getTaskThread(taskId) };
}

export async function addComment(
  taskId: string,
  accountId: string,
  body: string,
  mentionedUserIds: string[]
): Promise<{ comment?: TaskCommentView; error?: string }> {
  const { workspaceId, userId } = await authorize(accountId);
  if (!(await assertTaskInAccount(taskId, accountId)))
    return { error: "Tarea no encontrada" };
  const text = body.trim();
  if (!text) return { error: "El comentario está vacío" };

  const [comment] = await db
    .insert(taskComments)
    .values({ taskId, workspaceId, authorId: userId, body: text })
    .returning({ id: taskComments.id, createdAt: taskComments.createdAt });

  // Validar menciones: deben ser miembros del workspace y no el propio autor.
  let validMentions: string[] = [];
  if (mentionedUserIds.length > 0) {
    const unique = [...new Set(mentionedUserIds)].filter((id) => id !== userId);
    if (unique.length > 0) {
      const members = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            inArray(workspaceMembers.userId, unique)
          )
        );
      validMentions = members.map((m) => m.userId);
    }
  }

  if (validMentions.length > 0) {
    await db.insert(taskCommentMentions).values(
      validMentions.map((mentionedUserId) => ({
        commentId: comment.id,
        mentionedUserId,
      }))
    );

    // Notificación por mención (Fase 5 consume estas filas).
    const [author] = await db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const actorName = author?.name ?? "Alguien";
    const snippet = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    await db.insert(notifications).values(
      validMentions.map((mentionedUser) => ({
        workspaceId,
        userId: mentionedUser,
        type: "mention",
        taskId,
        accountId,
        actorId: userId,
        commentId: comment.id,
        body: `${actorName} te mencionó: "${snippet}"`,
      }))
    );
  }

  revalidate(accountId);
  return {
    comment: {
      id: comment.id,
      body: text,
      authorId: userId,
      authorName: null, // el cliente ya conoce su propio nombre vía members
      createdAt: comment.createdAt,
      mentionedUserIds: validMentions,
    },
  };
}

export async function deleteComment(
  commentId: string,
  accountId: string
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await authorize(accountId);
  const [row] = await db
    .select({ authorId: taskComments.authorId, accountId: tasks.accountId })
    .from(taskComments)
    .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
    .where(eq(taskComments.id, commentId))
    .limit(1);
  if (!row || row.accountId !== accountId)
    return { error: "Comentario no encontrado" };

  const access = await getTaskAccessibleAccountIds(userId, workspaceId);
  if (row.authorId !== userId && !access.all)
    return { error: "No autorizado" };

  await db.delete(taskComments).where(eq(taskComments.id, commentId));
  revalidate(accountId);
  return {};
}

export async function addAttachment(
  taskId: string,
  accountId: string,
  label: string,
  url: string
): Promise<{ attachment?: TaskAttachment; error?: string }> {
  const { userId } = await authorize(accountId);
  if (!(await assertTaskInAccount(taskId, accountId)))
    return { error: "Tarea no encontrada" };
  const cleanUrl = url.trim();
  const cleanLabel = label.trim() || cleanUrl;
  if (!/^https?:\/\//i.test(cleanUrl))
    return { error: "El link debe empezar con http(s)://" };

  const [attachment] = await db
    .insert(taskAttachments)
    .values({ taskId, label: cleanLabel, url: cleanUrl, createdBy: userId })
    .returning();
  revalidate(accountId);
  return { attachment };
}

export async function deleteAttachment(
  attachmentId: string,
  accountId: string
): Promise<{ error?: string }> {
  await authorize(accountId);
  const [row] = await db
    .select({ accountId: tasks.accountId })
    .from(taskAttachments)
    .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
    .where(eq(taskAttachments.id, attachmentId))
    .limit(1);
  if (!row || row.accountId !== accountId)
    return { error: "Adjunto no encontrado" };
  await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
  revalidate(accountId);
  return {};
}
