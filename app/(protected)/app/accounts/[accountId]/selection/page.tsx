import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { listSearchesForAccount } from "@/lib/queries/selection";
import { SearchList } from "@/components/selection/search-list";

interface Props {
  params: Promise<{ accountId: string }>;
}

export default async function SelectionPage({ params }: Props) {
  const { accountId } = await params;
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) notFound();

  const [acct] = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (!acct) notFound();

  const searches = await listSearchesForAccount(accountId);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <Link
        href={`/app/accounts/${accountId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        {acct.name}
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">Selección — {acct.name}</h1>

      <SearchList accountId={accountId} searches={searches} />
    </div>
  );
}
