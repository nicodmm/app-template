"use server";

import { db } from "@/lib/drizzle/db";
import { tasks } from "@/lib/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
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
  description: string,
  priority: number,
  assigneeId: string | null,
  dueDate: string | null
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await authorize(accountId);
  if (!isColumn(column)) return { error: "Columna inválida" };
  if (!description.trim()) return { error: "La descripción es requerida" };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${tasks.sortOrder}), 0)` })
    .from(tasks)
    .where(and(eq(tasks.accountId, accountId), eq(tasks.status, column)));

  await db.insert(tasks).values({
    accountId,
    workspaceId,
    createdBy: userId,
    assigneeId: assigneeId || null,
    description: description.trim(),
    priority,
    status: column,
    source: "manual",
    sortOrder: Number(maxOrder) + 1,
    dueDate: dueDate || null,
  });
  revalidate(accountId);
  return {};
}

export async function updateTaskFields(
  taskId: string,
  accountId: string,
  fields: {
    description?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    isPublic?: boolean;
  }
): Promise<{ error?: string }> {
  const { workspaceId } = await authorize(accountId);
  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
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
