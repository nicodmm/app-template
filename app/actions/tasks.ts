"use server";

import { db } from "@/lib/drizzle/db";
import { tasks } from "@/lib/drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { revalidatePath } from "next/cache";

async function getWorkspaceOrFail(userId: string) {
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  return workspace;
}

export async function completeTask(taskId: string, accountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .update(tasks)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}

export async function reopenTask(taskId: string, accountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .update(tasks)
    .set({ status: "pending", completedAt: null, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}

export async function deleteTask(taskId: string, accountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}

export async function createTask(
  accountId: string,
  description: string,
  priority: number,
  assigneeId?: string | null
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  if (!description.trim()) return { error: "La descripción es requerida" };
  await db.insert(tasks).values({
    accountId,
    workspaceId: workspace.id,
    createdBy: userId,
    assigneeId: assigneeId || null,
    description: description.trim(),
    priority,
    status: "pending",
    source: "manual",
  });
  revalidatePath(`/app/accounts/${accountId}`);
  return {};
}

export async function completeTasks(taskIds: string[], accountId: string): Promise<void> {
  if (taskIds.length === 0) return;
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .update(tasks)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(tasks.id, taskIds), eq(tasks.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}

export async function deleteTasks(taskIds: string[], accountId: string): Promise<void> {
  if (taskIds.length === 0) return;
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .delete(tasks)
    .where(and(inArray(tasks.id, taskIds), eq(tasks.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}

export async function updateTaskAssignee(
  taskId: string,
  accountId: string,
  assigneeId: string | null
): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .update(tasks)
    .set({ assigneeId: assigneeId || null, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)));
  revalidatePath(`/app/accounts/${accountId}`);
}
