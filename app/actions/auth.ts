"use server";

import { db } from "@/lib/drizzle/db";
import { users, workspaces, workspaceMembers, usageTracking } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";

export async function createDefaultWorkspace(
  userId: string,
  email: string
): Promise<void> {
  // Upsert user record — Supabase Auth creates the auth.users entry,
  // but our public.users table needs a matching row for FK constraints.
  await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, updatedAt: new Date() },
    });

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
