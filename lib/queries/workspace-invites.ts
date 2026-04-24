import { db } from "@/lib/drizzle/db";
import { workspaceInvites, users } from "@/lib/drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import type { WorkspaceInvite } from "@/lib/drizzle/schema/workspace_invites";

export type PendingInvite = WorkspaceInvite & {
  invitedByName: string | null;
  invitedByEmail: string | null;
};

export async function getPendingWorkspaceInvites(
  workspaceId: string
): Promise<PendingInvite[]> {
  const rows = await db
    .select({
      invite: workspaceInvites,
      fullName: users.fullName,
      email: users.email,
    })
    .from(workspaceInvites)
    .leftJoin(users, eq(users.id, workspaceInvites.invitedByUserId))
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        isNull(workspaceInvites.acceptedAt)
      )
    )
    .orderBy(desc(workspaceInvites.createdAt));

  return rows.map((r) => ({
    ...r.invite,
    invitedByName: r.fullName ?? null,
    invitedByEmail: r.email ?? null,
  }));
}

export async function getInviteByToken(
  token: string
): Promise<WorkspaceInvite | null> {
  const result = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);
  return result[0] ?? null;
}
