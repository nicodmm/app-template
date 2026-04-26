import { db } from "@/lib/drizzle/db";
import { workspaces, workspaceMembers, usageTracking, users } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { Workspace, WorkspaceMember, UsageTracking } from "@/lib/drizzle/schema";

export type WorkspaceMemberWithUser = {
  userId: string;
  role: string;
  displayName: string;
  email: string;
};

export async function getWorkspaceByUserId(
  userId: string
): Promise<Workspace | null> {
  const result = await db
    .select({ workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  return result[0]?.workspace ?? null;
}

/**
 * Single-trip variant of `getWorkspaceByUserId` + `getWorkspaceMember`. Used
 * by protected pages that always need both — saves one round-trip vs. the
 * sequential pair, which is meaningful on Supabase free tier (~50-100ms).
 */
export async function getWorkspaceWithMember(
  userId: string
): Promise<{ workspace: Workspace; member: WorkspaceMember } | null> {
  const result = await db
    .select({ workspace: workspaces, member: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  if (!result[0]) return null;
  return { workspace: result[0].workspace, member: result[0].member };
}

export async function getWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMember | null> {
  const result = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

export async function getMonthlyUsage(
  workspaceId: string
): Promise<UsageTracking | null> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const result = await db
    .select()
    .from(usageTracking)
    .where(
      and(
        eq(usageTracking.workspaceId, workspaceId),
        eq(usageTracking.month, monthStart)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

export async function getWorkspaceMembers(
  workspaceId: string
): Promise<WorkspaceMemberWithUser[]> {
  const rows = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      fullName: users.fullName,
      email: users.email,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return rows.map((r) => ({
    userId: r.userId,
    role: r.role,
    displayName: r.fullName ?? r.email,
    email: r.email,
  }));
}

export async function getWorkspaceWithUsage(userId: string): Promise<{
  workspace: Workspace;
  member: WorkspaceMember;
  usage: UsageTracking | null;
} | null> {
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return null;

  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member) return null;

  const usage = await getMonthlyUsage(workspace.id);

  return { workspace, member, usage };
}
