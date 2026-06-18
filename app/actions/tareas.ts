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
import { and, eq, sql, inArray, isNull } from "drizzle-orm";
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
  canAccessProject,
  assertScopeAccess,
} from "@/lib/queries/task-access";
import type { TaskScope } from "@/lib/tareas/scope";
import { scopeBoardPath } from "@/lib/tareas/scope";
import {
  TAREA_COLUMN_KEYS,
  isDoneColumn,
  type TareaColumnKey,
} from "@/lib/tareas/columns";
import { revalidatePath } from "next/cache";

/** Autoriza para CREAR en un scope (sin tarea previa). */
async function authorizeScope(
  scope: TaskScope
): Promise<{ workspaceId: string; userId: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const ok = await assertScopeAccess(userId, workspace.id, scope);
  if (!ok) throw new Error("Sin acceso a este contenedor");
  return { workspaceId: workspace.id, userId };
}

interface StoredTask {
  id: string;
  workspaceId: string;
  accountId: string | null;
  projectId: string | null;
  createdBy: string | null;
  assigneeId: string | null;
}

/** Carga la tarea y verifica acceso contra su scope ALMACENADO. */
async function authorizeTask(
  taskId: string
): Promise<{ workspaceId: string; userId: string; task: StoredTask }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const [task] = await db
    .select({
      id: tasks.id,
      workspaceId: tasks.workspaceId,
      accountId: tasks.accountId,
      projectId: tasks.projectId,
      createdBy: tasks.createdBy,
      assigneeId: tasks.assigneeId,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)))
    .limit(1);
  if (!task) throw new Error("Tarea no encontrada");

  let ok = false;
  if (task.accountId)
    ok = await canAccessAccountTasks(userId, workspace.id, task.accountId);
  else if (task.projectId)
    ok = await canAccessProject(userId, workspace.id, task.projectId);
  else ok = task.createdBy === userId || task.assigneeId === userId;
  if (!ok) throw new Error("Sin acceso a esta tarea");

  return { workspaceId: workspace.id, userId, task };
}

function revalidate(scope: TaskScope): void {
  revalidatePath(scopeBoardPath(scope));
  revalidatePath("/app/tareas");
  if (scope.kind === "account")
    revalidatePath(`/app/accounts/${scope.accountId}`);
}

/** Condición Drizzle "esta tarea pertenece a este scope" (para max sortOrder). */
function scopeColumnFilter(scope: TaskScope, userId: string) {
  if (scope.kind === "account") return eq(tasks.accountId, scope.accountId);
  if (scope.kind === "project") return eq(tasks.projectId, scope.projectId);
  return and(
    isNull(tasks.accountId),
    isNull(tasks.projectId),
    eq(tasks.createdBy, userId)
  );
}

function isColumn(value: string): value is TareaColumnKey {
  return (TAREA_COLUMN_KEYS as string[]).includes(value);
}

export async function moveTask(
  taskId: string,
  scope: TaskScope,
  toColumn: string,
  newSortOrder: number
): Promise<{ error?: string }> {
  const { workspaceId } = await authorizeTask(taskId);
  if (!isColumn(toColumn)) return { error: "Columna inválida" };
  await db
    .update(tasks)
    .set({
      status: toColumn,
      sortOrder: newSortOrder,
      completedAt: isDoneColumn(toColumn) ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));
  revalidate(scope);
  return {};
}

export async function createKanbanTask(
  scope: TaskScope,
  column: string,
  title: string,
  priority: number,
  assigneeId: string | null,
  dueDate: string | null
): Promise<{ id?: string; error?: string }> {
  const { workspaceId, userId } = await authorizeScope(scope);
  if (!isColumn(column)) return { error: "Columna inválida" };
  if (!title.trim()) return { error: "El título es requerido" };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${tasks.sortOrder}), 0)` })
    .from(tasks)
    .where(and(scopeColumnFilter(scope, userId), eq(tasks.status, column)));

  const [created] = await db
    .insert(tasks)
    .values({
      accountId: scope.kind === "account" ? scope.accountId : null,
      projectId: scope.kind === "project" ? scope.projectId : null,
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
  revalidate(scope);
  return { id: created.id };
}

export async function createSubtask(
  scope: TaskScope,
  parentTaskId: string,
  title: string
): Promise<{ id?: string; error?: string }> {
  if (!title.trim()) return { error: "El título es requerido" };
  const { workspaceId, userId, task: parent } =
    await authorizeTask(parentTaskId);

  const [created] = await db
    .insert(tasks)
    .values({
      accountId: parent.accountId,
      projectId: parent.projectId,
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
  revalidate(scope);
  return { id: created.id };
}

export async function updateTaskFields(
  taskId: string,
  scope: TaskScope,
  fields: {
    title?: string;
    description?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    isPublic?: boolean;
  }
): Promise<{ error?: string }> {
  const { workspaceId, userId, task } = await authorizeTask(taskId);

  const [before] = await db
    .select({
      assigneeId: tasks.assigneeId,
      title: tasks.title,
      description: tasks.description,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!before) return { error: "Tarea no encontrada" };

  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (fields.title !== undefined) patch.title = fields.title.trim() || null;
  if (fields.description !== undefined) {
    if (!fields.description.trim())
      return { error: "La descripción es requerida" };
    patch.description = fields.description.trim();
  }
  if (fields.priority !== undefined) patch.priority = fields.priority;
  if (fields.assigneeId !== undefined)
    patch.assigneeId = fields.assigneeId || null;
  if (fields.dueDate !== undefined) patch.dueDate = fields.dueDate || null;
  if (fields.isPublic !== undefined) patch.isPublic = fields.isPublic;

  await db
    .update(tasks)
    .set(patch)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));

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
      accountId: task.accountId,
      actorId: userId,
      body: `${actor?.name ?? "Alguien"} te asignó: "${snippet}"`,
    });
  }

  revalidate(scope);
  return {};
}

export async function deleteKanbanTask(
  taskId: string,
  scope: TaskScope
): Promise<{ error?: string }> {
  const { workspaceId } = await authorizeTask(taskId);
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));
  revalidate(scope);
  return {};
}

/**
 * Filtra una lista de taskIds a las que el usuario puede tocar (según el scope
 * ALMACENADO de cada tarea), memoizando el acceso por contenedor. Devuelve los
 * ids permitidos + las cuentas afectadas (para revalidar sus tableros).
 */
async function authorizeTaskIds(
  userId: string,
  workspaceId: string,
  taskIds: string[]
): Promise<{ allowed: string[]; affectedAccounts: Set<string> }> {
  const rows = await db
    .select({
      id: tasks.id,
      accountId: tasks.accountId,
      projectId: tasks.projectId,
      createdBy: tasks.createdBy,
      assigneeId: tasks.assigneeId,
    })
    .from(tasks)
    .where(and(inArray(tasks.id, taskIds), eq(tasks.workspaceId, workspaceId)));

  const accountAccess = new Map<string, boolean>();
  const projectAccess = new Map<string, boolean>();
  const allowed: string[] = [];
  const affectedAccounts = new Set<string>();

  for (const t of rows) {
    let ok = false;
    if (t.accountId) {
      if (!accountAccess.has(t.accountId)) {
        accountAccess.set(
          t.accountId,
          await canAccessAccountTasks(userId, workspaceId, t.accountId)
        );
      }
      ok = accountAccess.get(t.accountId) ?? false;
    } else if (t.projectId) {
      if (!projectAccess.has(t.projectId)) {
        projectAccess.set(
          t.projectId,
          await canAccessProject(userId, workspaceId, t.projectId)
        );
      }
      ok = projectAccess.get(t.projectId) ?? false;
    } else {
      ok = t.createdBy === userId || t.assigneeId === userId;
    }
    if (ok) {
      allowed.push(t.id);
      if (t.accountId) affectedAccounts.add(t.accountId);
    }
  }
  return { allowed, affectedAccounts };
}

function revalidateBulk(affectedAccounts: Set<string>): void {
  revalidatePath("/app/tareas");
  revalidatePath("/app/tareas/todas");
  for (const accountId of affectedAccounts)
    revalidatePath(`/app/accounts/${accountId}`);
}

/**
 * Acciones masivas sobre varias tareas (multi-selección de la lista global):
 * cambiar estado/columna, responsable y/o prioridad. Cada tarea se autoriza por
 * su scope almacenado; las no permitidas se ignoran silenciosamente.
 */
export async function bulkUpdateTasks(
  taskIds: string[],
  patch: { status?: string; assigneeId?: string | null; priority?: number }
): Promise<{ error?: string; updated?: number }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  if (taskIds.length === 0) return { updated: 0 };
  if (patch.status !== undefined && !isColumn(patch.status))
    return { error: "Columna inválida" };

  const { allowed, affectedAccounts } = await authorizeTaskIds(
    userId,
    workspace.id,
    taskIds
  );
  if (allowed.length === 0) return { updated: 0 };

  const set: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.completedAt = isDoneColumn(patch.status) ? new Date() : null;
  }
  if (patch.assigneeId !== undefined) set.assigneeId = patch.assigneeId || null;
  if (patch.priority !== undefined) set.priority = patch.priority;

  await db
    .update(tasks)
    .set(set)
    .where(and(inArray(tasks.id, allowed), eq(tasks.workspaceId, workspace.id)));

  revalidateBulk(affectedAccounts);
  return { updated: allowed.length };
}

export async function bulkDeleteTasks(
  taskIds: string[]
): Promise<{ error?: string; deleted?: number }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  if (taskIds.length === 0) return { deleted: 0 };

  const { allowed, affectedAccounts } = await authorizeTaskIds(
    userId,
    workspace.id,
    taskIds
  );
  if (allowed.length === 0) return { deleted: 0 };

  await db
    .delete(tasks)
    .where(and(inArray(tasks.id, allowed), eq(tasks.workspaceId, workspace.id)));

  revalidateBulk(affectedAccounts);
  return { deleted: allowed.length };
}

export async function createLabel(
  scope: TaskScope,
  name: string,
  color: string
): Promise<{ label?: TaskLabel; error?: string }> {
  const { workspaceId } = await authorizeScope(scope);
  if (!name.trim()) return { error: "El nombre es requerido" };
  if (!isLabelColor(color)) return { error: "Color inválido" };
  const [created] = await db
    .insert(taskLabels)
    .values({ workspaceId, name: name.trim(), color })
    .returning({
      id: taskLabels.id,
      name: taskLabels.name,
      color: taskLabels.color,
    });
  revalidate(scope);
  return { label: { id: created.id, name: created.name, color: created.color } };
}

export async function assignLabel(
  taskId: string,
  scope: TaskScope,
  labelId: string
): Promise<{ error?: string }> {
  const { workspaceId } = await authorizeTask(taskId);
  const [lbl] = await db
    .select({ id: taskLabels.id })
    .from(taskLabels)
    .where(
      and(eq(taskLabels.id, labelId), eq(taskLabels.workspaceId, workspaceId))
    )
    .limit(1);
  if (!lbl) return { error: "Etiqueta no encontrada" };
  await db
    .insert(taskLabelAssignments)
    .values({ taskId, labelId })
    .onConflictDoNothing();
  revalidate(scope);
  return {};
}

export async function unassignLabel(
  taskId: string,
  scope: TaskScope,
  labelId: string
): Promise<{ error?: string }> {
  await authorizeTask(taskId);
  await db
    .delete(taskLabelAssignments)
    .where(
      and(
        eq(taskLabelAssignments.taskId, taskId),
        eq(taskLabelAssignments.labelId, labelId)
      )
    );
  revalidate(scope);
  return {};
}

// ── Comentarios + @menciones + adjuntos (Fase 4) ─────────────────────────────

/** Carga el hilo (comentarios + adjuntos) de una tarea, con access-check. */
export async function loadTaskThread(
  taskId: string,
  scope: TaskScope
): Promise<{ thread?: TaskThread; error?: string }> {
  await authorizeTask(taskId);
  void scope;
  return { thread: await getTaskThread(taskId) };
}

export async function addComment(
  taskId: string,
  scope: TaskScope,
  body: string,
  mentionedUserIds: string[]
): Promise<{ comment?: TaskCommentView; error?: string }> {
  const { workspaceId, userId, task } = await authorizeTask(taskId);
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
        accountId: task.accountId,
        actorId: userId,
        commentId: comment.id,
        body: `${actorName} te mencionó: "${snippet}"`,
      }))
    );
  }

  revalidate(scope);
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
  scope: TaskScope
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const [row] = await db
    .select({ authorId: taskComments.authorId, taskId: taskComments.taskId })
    .from(taskComments)
    .where(eq(taskComments.id, commentId))
    .limit(1);
  if (!row) return { error: "Comentario no encontrado" };
  // Verifica acceso a la tarea dueña del comentario.
  await authorizeTask(row.taskId);
  if (row.authorId !== userId) return { error: "No autorizado" };
  await db.delete(taskComments).where(eq(taskComments.id, commentId));
  revalidate(scope);
  return {};
}

export async function addAttachment(
  taskId: string,
  scope: TaskScope,
  label: string,
  url: string
): Promise<{ attachment?: TaskAttachment; error?: string }> {
  const { userId } = await authorizeTask(taskId);
  const cleanUrl = url.trim();
  const cleanLabel = label.trim() || cleanUrl;
  if (!/^https?:\/\//i.test(cleanUrl))
    return { error: "El link debe empezar con http(s)://" };
  const [attachment] = await db
    .insert(taskAttachments)
    .values({ taskId, label: cleanLabel, url: cleanUrl, createdBy: userId })
    .returning();
  revalidate(scope);
  return { attachment };
}

export async function deleteAttachment(
  attachmentId: string,
  scope: TaskScope
): Promise<{ error?: string }> {
  const [row] = await db
    .select({ taskId: taskAttachments.taskId })
    .from(taskAttachments)
    .where(eq(taskAttachments.id, attachmentId))
    .limit(1);
  if (!row) return { error: "Adjunto no encontrado" };
  await authorizeTask(row.taskId);
  await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
  revalidate(scope);
  return {};
}
