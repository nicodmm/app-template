"use server";

import { db } from "@/lib/drizzle/db";
import {
  users,
  workspaces,
  workspaceMembers,
  workspaceInvites,
  usageTracking,
} from "@/lib/drizzle/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { mergePlaceholderUser } from "@/lib/workspace/merge-placeholder-user";
import { DEFAULT_WORKSPACE_SERVICES } from "@/lib/workspace/defaults";

export async function ensureUserRecord(
  userId: string,
  email: string
): Promise<void> {
  const lower = email.trim().toLowerCase();

  // ¿Hay un placeholder pendiente (creado por una invitación) para este email?
  const [placeholder] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.pending, true), sql`lower(${users.email}) = ${lower}`))
    .limit(1);

  if (placeholder && placeholder.id !== userId) {
    await db.transaction(async (tx) => {
      // 1. Liberar el email único que tiene el placeholder.
      await tx
        .update(users)
        .set({ email: `placeholder+${placeholder.id}@merge.local` })
        .where(eq(users.id, placeholder.id));
      // 2. Crear/asegurar la fila real con el UID de auth.
      await tx
        .insert(users)
        .values({ id: userId, email, pending: false })
        .onConflictDoUpdate({
          target: users.id,
          set: { email, pending: false, updatedAt: new Date() },
        });
      // 3. Mover todas las referencias del placeholder al usuario real y borrarlo.
      await mergePlaceholderUser(tx, placeholder.id, userId);
      // 4. Marcar la(s) invitación(es) pendientes de este email como aceptadas.
      await tx
        .update(workspaceInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(
          and(
            sql`lower(${workspaceInvites.email}) = ${lower}`,
            isNull(workspaceInvites.acceptedAt)
          )
        );
    });
    return;
  }

  // Sin placeholder → comportamiento original: upsert de la fila real.
  // Supabase Auth crea la entrada en auth.users; public.users necesita una
  // fila que la matchee para las FK.
  await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, updatedAt: new Date() },
    });
}

export async function createDefaultWorkspace(
  userId: string,
  email: string
): Promise<void> {
  await ensureUserRecord(userId, email);

  const existing = await getWorkspaceByUserId(userId);
  if (existing) return;

  const baseName = email.split("@")[0];
  const slug = `${baseName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: `${baseName}'s Workspace`,
      slug,
      ownerId: userId,
      services: DEFAULT_WORKSPACE_SERVICES,
    })
    .returning();

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  await db.insert(usageTracking).values({
    workspaceId: workspace.id,
    month: monthStart,
  });
}
