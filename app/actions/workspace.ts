"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  workspaces,
  workspaceMembers,
  workspaceInvites,
  users,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";

const ALLOWED_INVITE_ROLES = new Set(["admin", "member"]);
const ALLOWED_MEMBER_ROLES = new Set(["owner", "admin", "member"]);
const INVITE_TTL_DAYS = 7;

function assertCanManage(role: string | undefined): void {
  if (role !== "owner" && role !== "admin") {
    throw new Error("No tenés permisos para esta acción");
  }
}

function generateToken(): string {
  return randomBytes(20).toString("hex");
}

export async function renameWorkspace(
  name: string
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const member = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(member?.role);

  const trimmed = name.trim();
  if (!trimmed) return { error: "Nombre requerido" };

  await db
    .update(workspaces)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(workspaces.id, workspace.id));

  revalidatePath("/app/settings/workspace");
  return {};
}

export async function createWorkspaceInvite(
  email: string,
  role: string
): Promise<{ token?: string; error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const member = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(member?.role);

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    return { error: "Email inválido" };
  }
  if (!ALLOWED_INVITE_ROLES.has(role)) {
    return { error: "Rol inválido" };
  }

  // If the email is already a member of this workspace, reject.
  const existingMember = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(users.email, normalizedEmail)
      )
    )
    .limit(1);
  if (existingMember.length > 0) {
    return { error: "Ese email ya forma parte del workspace" };
  }

  // Dedup: reuse an existing pending invite for the same email.
  const pending = await db
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspace.id),
        eq(workspaceInvites.email, normalizedEmail),
        isNull(workspaceInvites.acceptedAt)
      )
    )
    .limit(1);

  if (pending.length > 0) {
    // Refresh token + role to match latest request
    const token = generateToken();
    await db
      .update(workspaceInvites)
      .set({
        token,
        role,
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      })
      .where(eq(workspaceInvites.id, pending[0].id));
    revalidatePath("/app/settings/workspace");
    return { token };
  }

  const token = generateToken();
  await db.insert(workspaceInvites).values({
    workspaceId: workspace.id,
    email: normalizedEmail,
    role,
    token,
    invitedByUserId: userId,
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  });

  revalidatePath("/app/settings/workspace");
  return { token };
}

export async function revokeWorkspaceInvite(inviteId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  const member = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(member?.role);

  await db
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, workspace.id)
      )
    );

  revalidatePath("/app/settings/workspace");
}

export async function acceptWorkspaceInvite(
  token: string
): Promise<{ workspaceId?: string; error?: string }> {
  const userId = await requireUserId();

  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);

  if (!invite) return { error: "Invitación no encontrada o expirada" };
  if (invite.acceptedAt) return { error: "Esta invitación ya fue usada" };
  if (invite.expiresAt < new Date()) return { error: "La invitación expiró" };

  // Is the user already in a workspace?
  const existing = await getWorkspaceByUserId(userId);
  if (existing) {
    if (existing.id === invite.workspaceId) {
      return { workspaceId: existing.id };
    }
    return {
      error: "Ya pertenecés a otro workspace. Cerrá sesión y registrate con otro email para aceptar.",
    };
  }

  await db.insert(workspaceMembers).values({
    workspaceId: invite.workspaceId,
    userId,
    role: invite.role,
  });

  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date(), acceptedByUserId: userId })
    .where(eq(workspaceInvites.id, invite.id));

  revalidatePath("/app/portfolio");
  revalidatePath("/app/settings/workspace");
  return { workspaceId: invite.workspaceId };
}

export async function removeWorkspaceMember(
  targetUserId: string
): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");

  const actor = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(actor?.role);

  if (targetUserId === userId) {
    throw new Error("No podés eliminarte a vos mismo — usá transferir propiedad");
  }

  const target = await getWorkspaceMember(workspace.id, targetUserId);
  if (!target) throw new Error("Miembro no encontrado");
  if (target.role === "owner") throw new Error("No se puede eliminar al owner");

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId)
      )
    );

  revalidatePath("/app/settings/workspace");
}

export async function changeWorkspaceMemberRole(
  targetUserId: string,
  newRole: string
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };

  const actor = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(actor?.role);

  if (!ALLOWED_MEMBER_ROLES.has(newRole) || newRole === "owner") {
    return { error: "Rol inválido" };
  }

  const target = await getWorkspaceMember(workspace.id, targetUserId);
  if (!target) return { error: "Miembro no encontrado" };
  if (target.role === "owner") {
    return { error: "No se puede cambiar el rol del owner" };
  }

  await db
    .update(workspaceMembers)
    .set({ role: newRole })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId)
      )
    );

  revalidatePath("/app/settings/workspace");
  return {};
}
