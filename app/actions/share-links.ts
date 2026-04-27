"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import {
  accountShareLinks,
  accounts,
  metaCampaigns,
  metaAds,
  metaAdAccounts,
} from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceMember } from "@/lib/queries/workspace";
import { generateShareToken } from "@/lib/share/token";
import { hashSharePassword } from "@/lib/share/password";
import {
  DEFAULT_SHARE_CONFIG,
  coerceShareConfig,
  type ShareConfig,
} from "@/lib/share/share-config";

async function assertCanManageShareLink(
  userId: string,
  accountId: string
): Promise<string> {
  const [acc] = await db
    .select({ workspaceId: accounts.workspaceId, ownerId: accounts.ownerId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!acc) throw new Error("Cuenta no encontrada");
  const member = await getWorkspaceMember(acc.workspaceId, userId);
  if (!member) throw new Error("Sin acceso al workspace");
  if (
    member.role !== "owner" &&
    member.role !== "admin" &&
    acc.ownerId !== userId
  ) {
    throw new Error("Sin permisos para esta cuenta");
  }
  return acc.workspaceId;
}

export async function createShareLink(
  accountId: string
): Promise<{ token: string }> {
  const userId = await requireUserId();
  await assertCanManageShareLink(userId, accountId);

  const [existing] = await db
    .select()
    .from(accountShareLinks)
    .where(eq(accountShareLinks.accountId, accountId))
    .limit(1);
  if (existing) {
    revalidatePath(`/app/accounts/${accountId}`);
    return { token: existing.token };
  }

  const token = generateShareToken();
  await db.insert(accountShareLinks).values({
    accountId,
    token,
    shareConfig: { ...DEFAULT_SHARE_CONFIG } as unknown as Record<
      string,
      boolean
    >,
  });
  revalidatePath(`/app/accounts/${accountId}`);
  return { token };
}

export async function updateShareConfig(
  shareLinkId: string,
  partial: Partial<ShareConfig>
): Promise<void> {
  const userId = await requireUserId();
  const [link] = await db
    .select({
      accountId: accountShareLinks.accountId,
      shareConfig: accountShareLinks.shareConfig,
    })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  const merged = coerceShareConfig({ ...link.shareConfig, ...partial });
  await db
    .update(accountShareLinks)
    .set({
      shareConfig: merged as unknown as Record<string, boolean>,
      updatedAt: new Date(),
    })
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
}

export async function setSharePassword(
  shareLinkId: string,
  password: string | null
): Promise<void> {
  const userId = await requireUserId();
  const [link] = await db
    .select({
      accountId: accountShareLinks.accountId,
      passwordVersion: accountShareLinks.passwordVersion,
    })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  const passwordHash =
    password && password.trim().length > 0
      ? await hashSharePassword(password)
      : null;
  await db
    .update(accountShareLinks)
    .set({
      passwordHash,
      passwordVersion: link.passwordVersion + 1,
      updatedAt: new Date(),
    })
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
}

export async function regenerateShareToken(
  shareLinkId: string
): Promise<{ token: string }> {
  const userId = await requireUserId();
  const [link] = await db
    .select({
      accountId: accountShareLinks.accountId,
      passwordVersion: accountShareLinks.passwordVersion,
    })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  const token = generateShareToken();
  await db
    .update(accountShareLinks)
    .set({
      token,
      passwordVersion: link.passwordVersion + 1,
      updatedAt: new Date(),
    })
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
  return { token };
}

export async function toggleShareLinkActive(
  shareLinkId: string,
  isActive: boolean
): Promise<void> {
  const userId = await requireUserId();
  const [link] = await db
    .select({ accountId: accountShareLinks.accountId })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  await db
    .update(accountShareLinks)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
}

export async function deleteShareLink(shareLinkId: string): Promise<void> {
  const userId = await requireUserId();
  const [link] = await db
    .select({ accountId: accountShareLinks.accountId })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  await db
    .delete(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
}

async function assertCanRenameMetaEntity(
  userId: string,
  adAccountId: string
): Promise<void> {
  const [adAcc] = await db
    .select({ accountId: metaAdAccounts.accountId })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, adAccountId))
    .limit(1);
  if (!adAcc?.accountId) throw new Error("Ad account no encontrado");
  await assertCanManageShareLink(userId, adAcc.accountId);
}

export async function setPublicCampaignName(
  campaignId: string,
  publicName: string | null
): Promise<void> {
  const userId = await requireUserId();
  const [c] = await db
    .select({ adAccountId: metaCampaigns.adAccountId })
    .from(metaCampaigns)
    .where(eq(metaCampaigns.id, campaignId))
    .limit(1);
  if (!c) throw new Error("Campaña no encontrada");
  await assertCanRenameMetaEntity(userId, c.adAccountId);
  const trimmed = publicName?.trim() || null;
  await db
    .update(metaCampaigns)
    .set({ publicName: trimmed, updatedAt: new Date() })
    .where(eq(metaCampaigns.id, campaignId));
}

export async function setPublicAdName(
  adId: string,
  publicName: string | null
): Promise<void> {
  const userId = await requireUserId();
  const [a] = await db
    .select({ adAccountId: metaAds.adAccountId })
    .from(metaAds)
    .where(eq(metaAds.id, adId))
    .limit(1);
  if (!a) throw new Error("Anuncio no encontrado");
  await assertCanRenameMetaEntity(userId, a.adAccountId);
  const trimmed = publicName?.trim() || null;
  await db
    .update(metaAds)
    .set({ publicName: trimmed, updatedAt: new Date() })
    .where(eq(metaAds.id, adId));
}
