"use server";

import { db } from "@/lib/drizzle/db";
import { notifications, users } from "@/lib/drizzle/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";

export interface NotificationView {
  id: string;
  type: string; // 'mention' | 'assignment'
  body: string;
  taskId: string | null;
  accountId: string | null;
  actorName: string | null;
  isRead: boolean;
  createdAt: Date;
}

export async function loadNotifications(): Promise<{
  items: NotificationView[];
  unreadCount: number;
}> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { items: [], unreadCount: 0 };

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      body: notifications.body,
      taskId: notifications.taskId,
      accountId: notifications.accountId,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
      actorName: users.fullName,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspace.id)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(20);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.isRead, false)
      )
    );

  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      body: r.body,
      taskId: r.taskId,
      accountId: r.accountId,
      actorName: r.actorName ?? null,
      isRead: r.isRead,
      createdAt: r.createdAt,
    })),
    unreadCount: Number(count ?? 0),
  };
}

export async function markNotificationRead(
  id: string
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  return {};
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const userId = await requireUserId();
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );
  return {};
}
