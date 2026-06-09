import { db } from "@/lib/drizzle/db";
import {
  accounts,
  accountConsultants,
  workspaceMembers,
  taskProjects,
  taskProjectMembers,
} from "@/lib/drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { TaskScope } from "@/lib/tareas/scope";

export interface TaskAccess {
  /** True si el usuario ve TODAS las cuentas del workspace (owner/admin). */
  all: boolean;
  /** IDs de cuentas accesibles (poblado en ambos casos). */
  accountIds: string[];
}

/**
 * Devuelve las cuentas cuyas tareas puede ver/editar el usuario.
 * - Owner/admin del workspace ⇒ todas las cuentas del workspace.
 * - Resto ⇒ solo cuentas que posee (`accounts.ownerId`) o donde es consultor
 *   (`account_consultants`).
 */
export async function getTaskAccessibleAccountIds(
  userId: string,
  workspaceId: string
): Promise<TaskAccess> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (member && (member.role === "owner" || member.role === "admin")) {
    const rows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.workspaceId, workspaceId));
    return { all: true, accountIds: rows.map((r) => r.id) };
  }

  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.workspaceId, workspaceId), eq(accounts.ownerId, userId))
    );

  const consulted = await db
    .select({ id: accountConsultants.accountId })
    .from(accountConsultants)
    .where(
      and(
        eq(accountConsultants.workspaceId, workspaceId),
        eq(accountConsultants.userId, userId)
      )
    );

  const ids = new Set<string>([
    ...owned.map((r) => r.id),
    ...consulted.map((r) => r.id),
  ]);
  return { all: false, accountIds: [...ids] };
}

/** Guard puntual: ¿el usuario puede acceder a las tareas de esta cuenta? */
export async function canAccessAccountTasks(
  userId: string,
  workspaceId: string,
  accountId: string
): Promise<boolean> {
  const { all, accountIds } = await getTaskAccessibleAccountIds(
    userId,
    workspaceId
  );
  return all || accountIds.includes(accountId);
}

/**
 * Proyectos internos visibles para el usuario: aquellos donde es miembro
 * (`task_project_members`). SIN bypass de admin — privado es privado.
 * Excluye archivados.
 */
export async function getAccessibleProjectIds(
  userId: string,
  workspaceId: string
): Promise<string[]> {
  const rows = await db
    .select({ id: taskProjects.id })
    .from(taskProjectMembers)
    .innerJoin(taskProjects, eq(taskProjects.id, taskProjectMembers.projectId))
    .where(
      and(
        eq(taskProjectMembers.userId, userId),
        eq(taskProjects.workspaceId, workspaceId),
        isNull(taskProjects.archivedAt)
      )
    );
  return rows.map((r) => r.id);
}

/** ¿El usuario es miembro de este proyecto (no archivado)? */
export async function canAccessProject(
  userId: string,
  workspaceId: string,
  projectId: string
): Promise<boolean> {
  const [row] = await db
    .select({ projectId: taskProjectMembers.projectId })
    .from(taskProjectMembers)
    .innerJoin(taskProjects, eq(taskProjects.id, taskProjectMembers.projectId))
    .where(
      and(
        eq(taskProjectMembers.projectId, projectId),
        eq(taskProjectMembers.userId, userId),
        eq(taskProjects.workspaceId, workspaceId),
        isNull(taskProjects.archivedAt)
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Verifica acceso para CREAR/operar en un scope dado (sin tarea previa).
 * - account → reglas de cuenta
 * - project → membresía
 * - loose   → basta estar logueado (el creador será el dueño)
 */
export async function assertScopeAccess(
  userId: string,
  workspaceId: string,
  scope: TaskScope
): Promise<boolean> {
  if (scope.kind === "account")
    return canAccessAccountTasks(userId, workspaceId, scope.accountId);
  if (scope.kind === "project")
    return canAccessProject(userId, workspaceId, scope.projectId);
  return true; // loose
}
