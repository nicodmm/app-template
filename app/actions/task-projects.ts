"use server";

import { db } from "@/lib/drizzle/db";
import {
  taskProjects,
  taskProjectMembers,
  tasks,
  workspaceMembers,
} from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  canAccessAccountTasks,
  canAccessProject,
  assertScopeAccess,
} from "@/lib/queries/task-access";
import { isLabelColor } from "@/lib/tareas/labels";
import type { TaskScope } from "@/lib/tareas/scope";
import { scopeBoardPath } from "@/lib/tareas/scope";
import { revalidatePath } from "next/cache";

async function requireWorkspace(): Promise<{
  workspaceId: string;
  userId: string;
}> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  return { workspaceId: workspace.id, userId };
}

export async function createProject(
  name: string,
  color: string | null,
  description: string | null
): Promise<{ id?: string; error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!name.trim()) return { error: "El nombre es requerido" };
  if (color && !isLabelColor(color)) return { error: "Color inválido" };

  const [project] = await db
    .insert(taskProjects)
    .values({
      workspaceId,
      name: name.trim(),
      color: color || null,
      description: description?.trim() || null,
      createdBy: userId,
    })
    .returning({ id: taskProjects.id });

  await db
    .insert(taskProjectMembers)
    .values({ projectId: project.id, userId })
    .onConflictDoNothing();

  revalidatePath("/app/tareas");
  return { id: project.id };
}

export async function updateProject(
  projectId: string,
  fields: { name?: string; color?: string | null; description?: string | null }
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!(await canAccessProject(userId, workspaceId, projectId)))
    return { error: "Sin acceso al proyecto" };
  const patch: Partial<typeof taskProjects.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (fields.name !== undefined) {
    if (!fields.name.trim()) return { error: "El nombre es requerido" };
    patch.name = fields.name.trim();
  }
  if (fields.color !== undefined) {
    if (fields.color && !isLabelColor(fields.color))
      return { error: "Color inválido" };
    patch.color = fields.color || null;
  }
  if (fields.description !== undefined)
    patch.description = fields.description?.trim() || null;

  await db
    .update(taskProjects)
    .set(patch)
    .where(
      and(
        eq(taskProjects.id, projectId),
        eq(taskProjects.workspaceId, workspaceId)
      )
    );
  revalidatePath(`/app/tareas/proyecto/${projectId}`);
  revalidatePath("/app/tareas");
  return {};
}

export async function archiveProject(
  projectId: string,
  archived: boolean
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!archived) {
    // Para des-archivar el guard de canAccessProject excluye archivados;
    // verificamos membresía directamente.
    const [m] = await db
      .select({ projectId: taskProjectMembers.projectId })
      .from(taskProjectMembers)
      .where(
        and(
          eq(taskProjectMembers.projectId, projectId),
          eq(taskProjectMembers.userId, userId)
        )
      )
      .limit(1);
    if (!m) return { error: "Sin acceso al proyecto" };
  } else if (!(await canAccessProject(userId, workspaceId, projectId))) {
    return { error: "Sin acceso al proyecto" };
  }
  await db
    .update(taskProjects)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(
      and(
        eq(taskProjects.id, projectId),
        eq(taskProjects.workspaceId, workspaceId)
      )
    );
  revalidatePath("/app/tareas");
  revalidatePath(`/app/tareas/proyecto/${projectId}`);
  return {};
}

export async function deleteProject(
  projectId: string
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  const [project] = await db
    .select({ createdBy: taskProjects.createdBy })
    .from(taskProjects)
    .where(
      and(
        eq(taskProjects.id, projectId),
        eq(taskProjects.workspaceId, workspaceId)
      )
    )
    .limit(1);
  if (!project) return { error: "Proyecto no encontrado" };
  if (project.createdBy !== userId)
    return { error: "Solo el creador puede borrar el proyecto" };
  // Cascade borra tareas, miembros y subtareas del proyecto.
  await db.delete(taskProjects).where(eq(taskProjects.id, projectId));
  revalidatePath("/app/tareas");
  return {};
}

export async function addProjectMember(
  projectId: string,
  newUserId: string
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!(await canAccessProject(userId, workspaceId, projectId)))
    return { error: "Sin acceso al proyecto" };
  // El nuevo miembro debe ser del mismo workspace.
  const [member] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, newUserId)
      )
    )
    .limit(1);
  if (!member) return { error: "El usuario no pertenece al workspace" };
  await db
    .insert(taskProjectMembers)
    .values({ projectId, userId: newUserId })
    .onConflictDoNothing();
  revalidatePath(`/app/tareas/proyecto/${projectId}`);
  return {};
}

export async function removeProjectMember(
  projectId: string,
  targetUserId: string
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();
  if (!(await canAccessProject(userId, workspaceId, projectId)))
    return { error: "Sin acceso al proyecto" };
  const [project] = await db
    .select({ createdBy: taskProjects.createdBy })
    .from(taskProjects)
    .where(eq(taskProjects.id, projectId))
    .limit(1);
  if (project?.createdBy === targetUserId)
    return { error: "No se puede quitar al creador del proyecto" };
  await db
    .delete(taskProjectMembers)
    .where(
      and(
        eq(taskProjectMembers.projectId, projectId),
        eq(taskProjectMembers.userId, targetUserId)
      )
    );
  revalidatePath(`/app/tareas/proyecto/${projectId}`);
  return {};
}

/**
 * Mueve una tarea de un contenedor a otro (cuenta ↔ proyecto ↔ suelta).
 * Verifica acceso al ORIGEN (vía la tarea) y al DESTINO (vía scope).
 */
export async function moveTaskToScope(
  taskId: string,
  toScope: TaskScope
): Promise<{ error?: string }> {
  const { workspaceId, userId } = await requireWorkspace();

  const [task] = await db
    .select({
      accountId: tasks.accountId,
      projectId: tasks.projectId,
      createdBy: tasks.createdBy,
      assigneeId: tasks.assigneeId,
      parentTaskId: tasks.parentTaskId,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
    .limit(1);
  if (!task) return { error: "Tarea no encontrada" };
  if (task.parentTaskId)
    return { error: "Mové la tarea padre; las subtareas la siguen" };

  // Acceso al origen.
  let originOk = false;
  if (task.accountId)
    originOk = await canAccessAccountTasks(userId, workspaceId, task.accountId);
  else if (task.projectId)
    originOk = await canAccessProject(userId, workspaceId, task.projectId);
  else originOk = task.createdBy === userId || task.assigneeId === userId;
  if (!originOk) return { error: "Sin acceso a la tarea" };

  // Acceso al destino.
  if (!(await assertScopeAccess(userId, workspaceId, toScope)))
    return { error: "Sin acceso al contenedor destino" };

  await db
    .update(tasks)
    .set({
      accountId: toScope.kind === "account" ? toScope.accountId : null,
      projectId: toScope.kind === "project" ? toScope.projectId : null,
      ...(toScope.kind === "loose" ? { createdBy: userId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));

  // Las subtareas heredan el nuevo contenedor.
  await db
    .update(tasks)
    .set({
      accountId: toScope.kind === "account" ? toScope.accountId : null,
      projectId: toScope.kind === "project" ? toScope.projectId : null,
      ...(toScope.kind === "loose" ? { createdBy: userId } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(tasks.parentTaskId, taskId), eq(tasks.workspaceId, workspaceId))
    );

  revalidatePath(scopeBoardPath(toScope));
  revalidatePath("/app/tareas");
  return {};
}
