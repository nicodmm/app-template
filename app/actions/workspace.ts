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
import { placeholderHasAssignments } from "@/lib/workspace/merge-placeholder-user";
import {
  createAdminClient,
  WORKSPACE_LOGOS_BUCKET,
} from "@/lib/supabase/admin";

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

  // Si el email YA es miembro real (registrado) del workspace, rechazar.
  // Un placeholder pendiente no cuenta (permite re-invitar / re-generar link).
  const existingMember = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(users.email, normalizedEmail),
        eq(users.pending, false)
      )
    )
    .limit(1);
  if (existingMember.length > 0) {
    return { error: "Ese email ya forma parte del workspace" };
  }

  // Placeholder asignable: si no existe ningún users para este email, crearlo
  // (pending=true) + su membership, así se le pueden cargar cuentas/tareas antes
  // de que se registre. Si ya existe un placeholder (re-invitación), asegurar la
  // membership y sincronizar el rol. Si existe un usuario REAL sin membership, no
  // tocamos nada (lo agrega el flujo de aceptar invitación).
  const [existingUser] = await db
    .select({ id: users.id, pending: users.pending })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!existingUser) {
    const [ph] = await db
      .insert(users)
      .values({ email: normalizedEmail, pending: true })
      .returning({ id: users.id });
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: ph.id,
      role,
    });
  } else if (existingUser.pending) {
    const [m] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.userId, existingUser.id)
        )
      )
      .limit(1);
    if (!m) {
      await db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: existingUser.id,
        role,
      });
    } else {
      await db
        .update(workspaceMembers)
        .set({ role })
        .where(eq(workspaceMembers.id, m.id));
    }
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

  // Cargar el invite (para conocer el email del placeholder) antes de borrarlo.
  const [invite] = await db
    .select({ email: workspaceInvites.email })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, workspace.id)
      )
    )
    .limit(1);

  await db
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, workspace.id)
      )
    );

  // Limpieza del placeholder si quedó sin asignaciones.
  if (invite) {
    const lower = invite.email.trim().toLowerCase();
    const [ph] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.pending, true), eq(users.email, lower)))
      .limit(1);
    if (ph && !(await placeholderHasAssignments(ph.id))) {
      await db
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, ph.id)
          )
        );
      const remaining = await db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, ph.id))
        .limit(1);
      if (remaining.length === 0) {
        await db.delete(users).where(eq(users.id, ph.id));
      }
    }
  }

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

  const existing = await getWorkspaceByUserId(userId);

  // Si ya es miembro del workspace del invite (placeholder fusionado en el
  // registro, o re-click del link), éxito idempotente — incluso si ya está
  // marcado como aceptado.
  if (existing && existing.id === invite.workspaceId) {
    if (!invite.acceptedAt) {
      await db
        .update(workspaceInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(eq(workspaceInvites.id, invite.id));
    }
    return { workspaceId: existing.id };
  }

  if (invite.acceptedAt) return { error: "Esta invitación ya fue usada" };
  if (invite.expiresAt < new Date()) return { error: "La invitación expiró" };

  if (existing) {
    return {
      error:
        "Ya pertenecés a otro workspace. Cerrá sesión y registrate con otro email para aceptar.",
    };
  }

  // Caso sin merge previo (no había placeholder): alta normal.
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

export async function setMemberFinanceAdmin(
  targetUserId: string,
  value: boolean
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const actor = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(actor?.role);
  await db
    .update(workspaceMembers)
    .set({ financeAdmin: value })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, targetUserId)
      )
    );
  revalidatePath("/app/settings/workspace");
  return {};
}

const SERVICE_MAX_LEN = 60;
const SERVICES_MAX_COUNT = 40;

function normalizeServiceName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function setWorkspaceServices(
  services: string[]
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const member = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(member?.role);

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of services) {
    if (typeof raw !== "string") continue;
    const name = normalizeServiceName(raw);
    if (!name || name.length > SERVICE_MAX_LEN) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(name);
    if (cleaned.length >= SERVICES_MAX_COUNT) break;
  }

  await db
    .update(workspaces)
    .set({ services: cleaned, updatedAt: new Date() })
    .where(eq(workspaces.id, workspace.id));

  revalidatePath("/app/settings/workspace");
  return {};
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const LOGO_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);
const LOGO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};

/**
 * Upload a workspace logo to the public `workspace-logos` bucket and persist
 * its public URL on the workspace. Owner/admin only. Returns the new URL so
 * the client can optimistically render it.
 */
export async function uploadWorkspaceLogo(input: {
  fileBase64: string; // raw base64, without the data URL prefix
  mimeType: string;
  fileSize: number;
}): Promise<{ logoUrl?: string; error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const member = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(member?.role);

  if (!LOGO_ALLOWED_MIME.has(input.mimeType)) {
    return { error: "Formato no soportado (usá PNG, JPG, WEBP, SVG o GIF)" };
  }
  if (input.fileSize <= 0 || input.fileSize > LOGO_MAX_BYTES) {
    return { error: "El archivo supera el máximo de 2 MB" };
  }

  const admin = createAdminClient();
  // Idempotent: create the bucket as public if it doesn't exist yet.
  await admin.storage.createBucket(WORKSPACE_LOGOS_BUCKET, { public: true });

  const ext = LOGO_EXT[input.mimeType] ?? "png";
  const path = `${workspace.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(input.fileBase64, "base64");
  const { error: upErr } = await admin.storage
    .from(WORKSPACE_LOGOS_BUCKET)
    .upload(path, buffer, { contentType: input.mimeType, upsert: true });
  if (upErr) return { error: upErr.message };

  const {
    data: { publicUrl },
  } = admin.storage.from(WORKSPACE_LOGOS_BUCKET).getPublicUrl(path);

  await db
    .update(workspaces)
    .set({ logoUrl: publicUrl, updatedAt: new Date() })
    .where(eq(workspaces.id, workspace.id));

  revalidatePath("/app/settings/workspace");
  revalidatePath("/app", "layout");
  return { logoUrl: publicUrl };
}

/**
 * Clear the workspace logo. Owner/admin only. We only null the column — the
 * underlying storage object is harmless to leave behind (public, tiny).
 */
export async function clearWorkspaceLogo(): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const member = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(member?.role);

  await db
    .update(workspaces)
    .set({ logoUrl: null, updatedAt: new Date() })
    .where(eq(workspaces.id, workspace.id));

  revalidatePath("/app/settings/workspace");
  revalidatePath("/app", "layout");
  return {};
}

const AGENCY_CONTEXT_MAX_LEN = 4000;

export async function setWorkspaceAgencyContext(
  context: string
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const member = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(member?.role);

  const trimmed = context.trim();
  if (trimmed.length > AGENCY_CONTEXT_MAX_LEN) {
    return {
      error: `Máximo ${AGENCY_CONTEXT_MAX_LEN} caracteres (recibidos ${trimmed.length}).`,
    };
  }

  await db
    .update(workspaces)
    .set({
      agencyContext: trimmed.length > 0 ? trimmed : null,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspace.id));

  revalidatePath("/app/settings/workspace");
  return {};
}
