"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accountShareLinks,
  selectionCandidates,
  selectionSearchShareLinks,
  selectionSearches,
} from "@/lib/drizzle/schema";
import { coerceShareConfig } from "@/lib/share/share-config";
import { createAdminClient, SELECTION_CV_BUCKET } from "@/lib/supabase/admin";

type R = { success: boolean; error?: string };

/** Resuelve un token público (de cuenta o de búsqueda) a su contexto. */
async function resolvePublicToken(
  token: string
): Promise<{ accountId: string; searchId: string | null } | null> {
  // 1. Link de cuenta (requiere selection habilitado).
  const [acc] = await db
    .select({
      accountId: accountShareLinks.accountId,
      isActive: accountShareLinks.isActive,
      shareConfig: accountShareLinks.shareConfig,
    })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.token, token))
    .limit(1);
  if (acc) {
    if (!acc.isActive) return null;
    if (!coerceShareConfig(acc.shareConfig).selection) return null;
    return { accountId: acc.accountId, searchId: null };
  }
  // 2. Link de búsqueda individual.
  const [sl] = await db
    .select({
      searchId: selectionSearchShareLinks.searchId,
      isActive: selectionSearchShareLinks.isActive,
    })
    .from(selectionSearchShareLinks)
    .where(eq(selectionSearchShareLinks.token, token))
    .limit(1);
  if (sl) {
    if (!sl.isActive) return null;
    const [s] = await db
      .select({ accountId: selectionSearches.accountId })
      .from(selectionSearches)
      .where(eq(selectionSearches.id, sl.searchId))
      .limit(1);
    if (!s) return null;
    return { accountId: s.accountId, searchId: sl.searchId };
  }
  return null;
}

async function assertCandidateVisible(
  candidateId: string,
  ctx: { accountId: string; searchId: string | null }
): Promise<boolean> {
  const [c] = await db
    .select({
      accountId: selectionCandidates.accountId,
      searchId: selectionCandidates.searchId,
    })
    .from(selectionCandidates)
    .where(eq(selectionCandidates.id, candidateId))
    .limit(1);
  if (!c) return false;
  if (c.accountId !== ctx.accountId) return false;
  if (ctx.searchId && c.searchId !== ctx.searchId) return false;
  return true;
}

export async function clientSetCandidateStatus(input: {
  token: string;
  candidateId: string;
  status: "advance" | "offer" | "rejected";
  interviewModality?: string;
  interviewSchedule?: string;
  offerConditions?: string;
  rejectionReason?: string;
}): Promise<R> {
  const ctx = await resolvePublicToken(input.token);
  if (!ctx) return { success: false, error: "Acceso inválido" };
  if (!(await assertCandidateVisible(input.candidateId, ctx)))
    return { success: false, error: "Candidato no encontrado" };
  if (input.status === "rejected" && !input.rejectionReason?.trim())
    return { success: false, error: "El motivo de rechazo es obligatorio" };

  await db
    .update(selectionCandidates)
    .set({
      status: input.status,
      interviewModality:
        input.status === "advance" ? input.interviewModality ?? null : undefined,
      interviewSchedule:
        input.status === "advance" ? input.interviewSchedule ?? null : undefined,
      offerConditions:
        input.status === "offer" ? input.offerConditions ?? null : undefined,
      rejectionReason:
        input.status === "rejected" ? input.rejectionReason ?? null : undefined,
      feedbackAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(selectionCandidates.id, input.candidateId));
  return { success: true };
}

export async function clientSaveCandidateFeedback(input: {
  token: string;
  candidateId: string;
  clientNotes: string;
  clientRating: number;
}): Promise<R> {
  const ctx = await resolvePublicToken(input.token);
  if (!ctx) return { success: false, error: "Acceso inválido" };
  if (!(await assertCandidateVisible(input.candidateId, ctx)))
    return { success: false, error: "Candidato no encontrado" };
  const rating = Math.max(0, Math.min(5, Math.round(input.clientRating)));
  await db
    .update(selectionCandidates)
    .set({
      clientNotes: input.clientNotes,
      clientRating: rating,
      feedbackAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(selectionCandidates.id, input.candidateId));
  return { success: true };
}

export async function clientGetCandidateCvUrl(input: {
  token: string;
  candidateId: string;
}): Promise<{ url: string | null; error?: string }> {
  const ctx = await resolvePublicToken(input.token);
  if (!ctx) return { url: null, error: "Acceso inválido" };
  if (!(await assertCandidateVisible(input.candidateId, ctx)))
    return { url: null, error: "Candidato no encontrado" };
  const [c] = await db
    .select({
      cvStoragePath: selectionCandidates.cvStoragePath,
      cvUrl: selectionCandidates.cvUrl,
    })
    .from(selectionCandidates)
    .where(eq(selectionCandidates.id, input.candidateId))
    .limit(1);
  if (!c) return { url: null };
  if (c.cvUrl) return { url: c.cvUrl };
  if (c.cvStoragePath) {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(SELECTION_CV_BUCKET)
      .createSignedUrl(c.cvStoragePath, 60 * 10);
    if (error) return { url: null, error: error.message };
    return { url: data.signedUrl };
  }
  return { url: null };
}
