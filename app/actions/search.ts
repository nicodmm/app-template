"use server";

import { requireUserId } from "@/lib/auth";
import { getWorkspaceWithMember } from "@/lib/queries/workspace";
import {
  searchWorkspace,
  type SearchResult,
} from "@/lib/queries/search";

export async function fetchSearchResults(
  query: string
): Promise<SearchResult[]> {
  const userId = await requireUserId();
  const result = await getWorkspaceWithMember(userId);
  if (!result) return [];
  return searchWorkspace(
    { workspaceId: result.workspace.id, userId, role: result.member.role },
    query
  );
}
