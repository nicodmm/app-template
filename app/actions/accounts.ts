"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import { accounts, usageTracking } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getMonthlyUsage } from "@/lib/queries/workspace";
import { getAccountsCount } from "@/lib/queries/accounts";

async function getWorkspaceOrThrow(userId: string) {
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace not found");
  return workspace;
}

export async function createAccount(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrThrow(userId);

  const name = formData.get("name") as string;
  const goals = (formData.get("goals") as string) || null;
  const serviceScopeValues = formData.getAll("serviceScope") as string[];
  const serviceScope = serviceScopeValues.length > 0 ? serviceScopeValues.join(", ") : null;
  const ownerId = (formData.get("ownerId") as string) || userId;

  if (!name?.trim()) throw new Error("El nombre de la cuenta es requerido");

  // Quota check — limit enforced against usage_tracking.accounts_count
  const count = await getAccountsCount(workspace.id);
  // Phase 9 wires real tier limits from Stripe; placeholder: Free = 2 accounts
  if (count >= 2) {
    redirect("/app/accounts/new?error=" + encodeURIComponent("Límite de cuentas alcanzado. Actualizá tu plan para crear más."));
  }

  const [account] = await db
    .insert(accounts)
    .values({
      workspaceId: workspace.id,
      name: name.trim(),
      goals,
      serviceScope,
      ownerId,
    })
    .returning();

  // Sync usage_tracking.accounts_count
  const newCount = await getAccountsCount(workspace.id);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  await db
    .insert(usageTracking)
    .values({
      workspaceId: workspace.id,
      month: monthStart,
      accountsCount: newCount,
    })
    .onConflictDoUpdate({
      target: [usageTracking.workspaceId, usageTracking.month],
      set: { accountsCount: newCount, updatedAt: new Date() },
    });

  redirect(`/app/accounts/${account.id}`);
}

export async function updateAccount(formData: FormData): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrThrow(userId);

  const accountId = formData.get("accountId") as string;
  const name = formData.get("name") as string;
  const goals = (formData.get("goals") as string) || null;
  const serviceScopeValues = formData.getAll("serviceScope") as string[];
  const serviceScope = serviceScopeValues.length > 0 ? serviceScopeValues.join(", ") : null;
  const ownerId = (formData.get("ownerId") as string) || null;

  if (!name?.trim()) return { error: "El nombre es requerido" };

  await db
    .update(accounts)
    .set({
      name: name.trim(),
      goals,
      serviceScope,
      ownerId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id))
    );

  revalidatePath(`/app/accounts/${accountId}`);
  return {};
}

export async function deleteAccount(accountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrThrow(userId);

  await db
    .delete(accounts)
    .where(
      and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id))
    );

  revalidatePath("/app/portfolio");
  redirect("/app/portfolio");
}

export async function updateHealthSignal(
  accountId: string,
  signal: string,
  justification: string
): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrThrow(userId);

  await db
    .update(accounts)
    .set({
      healthSignal: signal,
      healthJustification: justification,
      updatedAt: new Date(),
    })
    .where(
      and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id))
    );

  revalidatePath(`/app/accounts/${accountId}`);
  revalidatePath("/app/portfolio");
}
