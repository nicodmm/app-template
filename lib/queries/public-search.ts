import { db } from "@/lib/drizzle/db";
import {
  selectionSearchShareLinks,
  selectionSearches,
  workspaces,
} from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { loadCandidatesForSearch, type PublicCandidate } from "./selection-public";

export interface PublicSearchSnapshot {
  share: { token: string; requiresPassword: boolean; passwordVersion: number };
  workspace: { name: string; logoUrl: string | null };
  search: { id: string; position: string; positionDescription: string | null };
  candidates: PublicCandidate[];
}

export interface PublicSearchLookup {
  status: "ok" | "not_found" | "inactive" | "password_required";
  snapshot?: PublicSearchSnapshot;
  shareLinkId?: string;
  passwordHash?: string;
  passwordVersion?: number;
}

export async function getPublicSearchSnapshot(
  token: string
): Promise<PublicSearchLookup> {
  const [link] = await db
    .select()
    .from(selectionSearchShareLinks)
    .where(eq(selectionSearchShareLinks.token, token))
    .limit(1);

  if (!link) return { status: "not_found" };
  if (!link.isActive) return { status: "inactive" };

  const [search] = await db
    .select({
      id: selectionSearches.id,
      position: selectionSearches.position,
      positionDescription: selectionSearches.positionDescription,
      workspaceId: selectionSearches.workspaceId,
    })
    .from(selectionSearches)
    .where(eq(selectionSearches.id, link.searchId))
    .limit(1);

  if (!search) return { status: "not_found" };

  const [ws] = await db
    .select({ name: workspaces.name, logoUrl: workspaces.logoUrl })
    .from(workspaces)
    .where(eq(workspaces.id, search.workspaceId))
    .limit(1);

  const candidates = await loadCandidatesForSearch(search.id);

  // Best-effort view tracking (non-awaited, ignore failures).
  void db
    .update(selectionSearchShareLinks)
    .set({
      viewCount: link.viewCount + 1,
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(selectionSearchShareLinks.id, link.id))
    .catch(() => {});

  const snapshot: PublicSearchSnapshot = {
    share: {
      token: link.token,
      requiresPassword: !!link.passwordHash,
      passwordVersion: link.passwordVersion,
    },
    workspace: { name: ws?.name ?? "", logoUrl: ws?.logoUrl ?? null },
    search: {
      id: search.id,
      position: search.position,
      positionDescription: search.positionDescription ?? null,
    },
    candidates,
  };

  return {
    status: link.passwordHash ? "password_required" : "ok",
    snapshot,
    shareLinkId: link.id,
    passwordHash: link.passwordHash ?? undefined,
    passwordVersion: link.passwordVersion,
  };
}
