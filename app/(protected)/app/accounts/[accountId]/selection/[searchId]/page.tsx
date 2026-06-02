import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { getSearch, listCandidatesForSearch } from "@/lib/queries/selection";
import { CandidateWorkspace } from "@/components/selection/candidate-workspace";

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

      <h1 className="mb-6 text-2xl font-semibold">{search.position}</h1>

      <CandidateWorkspace
        accountId={accountId}
        searchId={searchId}
        search={search}
        candidates={candidates}
      />
    </div>
  );
}
