"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import { accounts, usageTracking } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getMonthlyUsage } from "@/lib/queries/workspace";
import { getAccountsCount, getAccountById } from "@/lib/queries/accounts";
import { buildEnabledModulesFromForm } from "@/lib/modules-client";

function parseFee(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

function parseStartDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function triggerEnrichment(
  accountId: string,
  workspaceId: string,
  websiteUrl: string
): Promise<void> {
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("enrich-account", {
      accountId,
      workspaceId,
      websiteUrl,
    });
  } catch (err) {
    // Best-effort: never block the create/update flow on Trigger.dev issues.
    console.error("Failed to enqueue enrich-account", err);
  }
}

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
  const startDate = parseStartDate(formData.get("startDate") as string | null);
  const fee = parseFee(formData.get("fee") as string | null);
  const websiteUrl = parseUrl(formData.get("websiteUrl") as string | null);
  const linkedinUrl = parseUrl(formData.get("linkedinUrl") as string | null);
  const enabledModules = buildEnabledModulesFromForm(
    formData.getAll("enabledModules") as string[]
  );

  if (!name?.trim()) throw new Error("El nombre de la cuenta es requerido");

  const [account] = await db
    .insert(accounts)
    .values({
      workspaceId: workspace.id,
      name: name.trim(),
      goals,
      serviceScope,
      ownerId,
      startDate,
      fee,
      enabledModules,
      websiteUrl,
      linkedinUrl,
      enrichmentStatus: websiteUrl ? "pending" : null,
    })
    .returning();

  if (websiteUrl) {
    await triggerEnrichment(account.id, workspace.id, websiteUrl);
  }

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
  const startDate = parseStartDate(formData.get("startDate") as string | null);
  const fee = parseFee(formData.get("fee") as string | null);
  const websiteUrl = parseUrl(formData.get("websiteUrl") as string | null);
  const linkedinUrl = parseUrl(formData.get("linkedinUrl") as string | null);
  const enabledModules = buildEnabledModulesFromForm(
    formData.getAll("enabledModules") as string[]
  );

  if (!name?.trim()) return { error: "El nombre es requerido" };

  const existing = await getAccountById(accountId, workspace.id);
  const websiteChanged = (existing?.websiteUrl ?? null) !== websiteUrl;

  await db
    .update(accounts)
    .set({
      name: name.trim(),
      goals,
      serviceScope,
      ownerId,
      startDate,
      fee,
      enabledModules,
      websiteUrl,
      linkedinUrl,
      ...(websiteChanged && websiteUrl
        ? { enrichmentStatus: "pending", enrichmentError: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id))
    );

  if (websiteChanged && websiteUrl) {
    await triggerEnrichment(accountId, workspace.id, websiteUrl);
  }

  revalidatePath(`/app/accounts/${accountId}`);
  return {};
}

export async function reEnrichAccount(accountId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrThrow(userId);

  const account = await getAccountById(accountId, workspace.id);
  if (!account) throw new Error("Cuenta no encontrada");
  if (!account.websiteUrl) throw new Error("Esta cuenta no tiene una web configurada");

  await db
    .update(accounts)
    .set({
      enrichmentStatus: "pending",
      enrichmentError: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id))
    );

  await triggerEnrichment(accountId, workspace.id, account.websiteUrl);
  revalidatePath(`/app/accounts/${accountId}`);
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
