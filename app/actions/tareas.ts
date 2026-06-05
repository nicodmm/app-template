"use server";

import { db } from "@/lib/drizzle/db";
import { tasks, taskLabels, taskLabelAssignments } from "@/lib/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { isLabelColor } from "@/lib/tareas/labels";
import type { TaskLabel } from "@/lib/queries/tareas";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { canAccessAccountTasks } from "@/lib/queries/task-access";
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
  const { workspaceId } = await authorize(accountId);
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

export async function assignLabel(
  taskId: string,
  accountId: string,
  labelId: string
): Promise<{ error?: string }> {
  await authorize(accountId);
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
