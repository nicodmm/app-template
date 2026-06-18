import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { getSearch, listCandidatesForSearch } from "@/lib/queries/selection";
import { getSearchShareLink } from "@/app/actions/selection";
import { CandidateWorkspace } from "@/components/selection/candidate-workspace";
import { SearchShareSection } from "@/components/selection/search-share-section";

interface Props {
  params: Promise<{ accountId: string; searchId: string }>;
}

export default async function CandidatesPage({ params }: Props) {
  const { accountId, searchId } = await params;
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) notFound();

  const [acct] = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (!acct) notFound();

  const search = await getSearch(searchId, accountId);
  if (!search) notFound();

  const candidates = await listCandidatesForSearch(searchId);
  const share = await getSearchShareLink({ accountId, searchId });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <Link
        href={`/app/accounts/${accountId}/selection`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        Selección — {acct.name}
      </Link>

      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-2xl font-semibold">{search.position}</h1>
        <SearchShareSection
          accountId={accountId}
          searchId={searchId}
          initial={share}
        />
      </div>

      <CandidateWorkspace
        accountId={accountId}
        searchId={searchId}
        search={search}
        candidates={candidates}
      />
    </div>
  );
}
