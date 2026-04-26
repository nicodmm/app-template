import { db } from "@/lib/drizzle/db";
import { accounts, transcripts } from "@/lib/drizzle/schema";
import { and, eq, ilike, isNull, or, desc, sql } from "drizzle-orm";

export interface AccountSearchResult {
  type: "account";
  accountId: string;
  accountName: string;
  /** Whether the account is closed; closed accounts get a muted treatment in the UI. */
  closed: boolean;
}

export interface TranscriptSearchResult {
  type: "transcript";
  transcriptId: string;
  accountId: string;
  accountName: string;
  /** Excerpt of the transcript content with the first match position centered. */
  snippet: string;
  /** Lower-case query, used by the UI to highlight the match. */
  matchTerm: string;
  meetingDate: string | null;
  createdAt: Date;
}

export type SearchResult = AccountSearchResult | TranscriptSearchResult;

export interface SearchScope {
  workspaceId: string;
  userId: string;
  role: string;
}

const ACCOUNT_LIMIT = 8;
const TRANSCRIPT_LIMIT = 12;
const SNIPPET_RADIUS = 60;
const MIN_QUERY_LEN = 2;

function canSeeAllAccounts(role: string): boolean {
  return role === "owner" || role === "admin";
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

function buildSnippet(content: string, term: string): string {
  const lowerContent = content.toLowerCase();
  const idx = lowerContent.indexOf(term);
  if (idx === -1) {
    return content.slice(0, SNIPPET_RADIUS * 2).trim();
  }
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(content.length, idx + term.length + SNIPPET_RADIUS);
  let snippet = content.slice(start, end).trim().replace(/\s+/g, " ");
  if (start > 0) snippet = "…" + snippet;
  if (end < content.length) snippet = snippet + "…";
  return snippet;
}

/**
 * Workspace-scoped global search across account names and transcript content.
 * Uses Postgres ILIKE for the MVP — fast enough for the typical workspace
 * size, no extra index plumbing. Migrate to a GIN tsvector index if a
 * specific workspace gets slow.
 */
export async function searchWorkspace(
  scope: SearchScope,
  rawQuery: string
): Promise<SearchResult[]> {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < MIN_QUERY_LEN) return [];

  const pattern = `%${escapeLike(query)}%`;
  const isElevated = canSeeAllAccounts(scope.role);

  const accountConds = [
    eq(accounts.workspaceId, scope.workspaceId),
    ilike(accounts.name, pattern),
  ];
  if (!isElevated) {
    accountConds.push(eq(accounts.ownerId, scope.userId));
  }

  const transcriptConds = [
    eq(transcripts.workspaceId, scope.workspaceId),
    ilike(transcripts.content, pattern),
  ];

  const [accountRows, transcriptRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        closedAt: accounts.closedAt,
      })
      .from(accounts)
      .where(and(...accountConds))
      .orderBy(
        sql`${accounts.closedAt} NULLS FIRST`,
        accounts.name
      )
      .limit(ACCOUNT_LIMIT),

    db
      .select({
        transcriptId: transcripts.id,
        accountId: transcripts.accountId,
        accountName: accounts.name,
        accountOwnerId: accounts.ownerId,
        accountClosedAt: accounts.closedAt,
        content: transcripts.content,
        meetingDate: transcripts.meetingDate,
        createdAt: transcripts.createdAt,
      })
      .from(transcripts)
      .innerJoin(accounts, eq(accounts.id, transcripts.accountId))
      .where(
        and(
          ...transcriptConds,
          eq(accounts.workspaceId, scope.workspaceId),
          isElevated
            ? undefined
            : or(
                eq(accounts.ownerId, scope.userId),
                isNull(accounts.ownerId)
              )
        )
      )
      .orderBy(desc(transcripts.createdAt))
      .limit(TRANSCRIPT_LIMIT),
  ]);

  const visibleTranscripts = isElevated
    ? transcriptRows
    : transcriptRows.filter((r) => r.accountOwnerId === scope.userId);

  const accountResults: AccountSearchResult[] = accountRows.map((r) => ({
    type: "account",
    accountId: r.id,
    accountName: r.name,
    closed: r.closedAt !== null,
  }));

  const transcriptResults: TranscriptSearchResult[] = visibleTranscripts.map(
    (r) => ({
      type: "transcript",
      transcriptId: r.transcriptId,
      accountId: r.accountId,
      accountName: r.accountName,
      snippet: buildSnippet(r.content, query),
      matchTerm: query,
      meetingDate: r.meetingDate,
      createdAt: r.createdAt,
    })
  );

  return [...accountResults, ...transcriptResults];
}
