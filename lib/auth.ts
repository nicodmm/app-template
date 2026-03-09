import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/drizzle/db";
import { users } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import type { User } from "@/lib/drizzle/schema/users";

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  return userId;
}

export async function getCurrentUser(): Promise<User | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function getCurrentUserRole(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.role ?? null;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const role = await getCurrentUserRole();
  return role === "admin";
}

export async function requireAdminAccess(): Promise<void> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/unauthorized");
}
