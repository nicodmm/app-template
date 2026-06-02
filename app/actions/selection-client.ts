"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accountShareLinks,
  selectionCandidates,
} from "@/lib/drizzle/schema";
import { coerceShareConfig } from "@/lib/share/share-config";
import { createAdminClient, SELECTION_CV_BUCKET } from "@/lib/supabase/admin";

type R = { success: boolean; error?: string };

/** Resolve token -> accountId, enforcing active link + selection share flag. */
async function resolveTokenAccount(token: string): Promise<string | null> {
  const [link] = await db
    .select({
      accountId: accountShareLinks.accountId,
      isActive: accountShareLinks.isActive,
      shareConfig: accountShareLinks.shareConfig,
    })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.token, token))
    .limit(1);
  if (!link || !link.isActive) return null;
  const cfg = coerceShareConfig(link.shareConfig);
  if (!cfg.selection) return null;
  return link.accountId;
}

async function assertCandidateInAccount(
  candidateId: string,
  accountId: string
): Promise<boolean> {
  const [c] = await db
    .select({ id: selectionCandidates.id })
    .from(selectionCandidates)
    .where(
      and(
        eq(selectionCandidates.id, candidateId),
        eq(selectionCandidates.accountId, accountId)
      )
    )
    .limit(1);
  return !!c;
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
  const accountId = await resolveTokenAccount(input.token);
  if (!accountId) return { success: false, error: "Acceso inválido" };
  if (!(await assertCandidateInAccount(input.candidateId, accountId)))
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
  const accountId = await resolveTokenAccount(input.token);
  if (!accountId) return { success: false, error: "Acceso inválido" };
  if (!(await assertCandidateInAccount(input.candidateId, accountId)))
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
  const accountId = await resolveTokenAccount(input.token);
  if (!accountId) return { url: null, error: "Acceso inválido" };
  if (!(await assertCandidateInAccount(input.candidateId, accountId)))
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
