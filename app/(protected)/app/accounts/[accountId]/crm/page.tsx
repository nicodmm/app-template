// app/(protected)/app/accounts/[accountId]/crm/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  getCrmConnectionState,
  getCrmKpis,
  getCrmBreakdownBySource,
  getCrmDeals,
  getCrmFilterOptions,
} from "@/lib/queries/crm";
import { CrmDashboard } from "@/components/crm-dashboard";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{
    preset?: string;
    since?: string;
    until?: string;
    tab?: string;
    page?: string;
    source?: string;
    stage?: string;
    status?: string;
  }>;
}

function resolvePeriod(sp: { preset?: string; since?: string; until?: string }): {
  since: Date;
  until: Date;
  preset: "7" | "30" | "90" | "custom";
} {
  const now = new Date();
  if (sp.since && sp.until) {
    return { since: new Date(sp.since), until: new Date(sp.until), preset: "custom" };
  }
  const preset = (sp.preset === "7" || sp.preset === "90" ? sp.preset : "30") as "7" | "30" | "90";
  const days = parseInt(preset, 10);
  return {
    since: new Date(now.getTime() - days * 86400_000),
    until: now,
    preset,
  };
}

export default async function CrmPage({ params, searchParams }: PageProps) {
  const { accountId } = await params;
  const sp = await searchParams;

  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return notFound();

  const acc = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (acc.length === 0) return notFound();

  const state = await getCrmConnectionState(workspace.id, accountId);

  if (state.state === "no_connection") {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold mb-2">CRM — {acc[0].name}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Conectá el CRM de este cliente para sincronizar deals.
        </p>
        <a
          href={`/api/auth/crm/pipedrive/login?accountId=${accountId}`}
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Conectar Pipedrive
        </a>
      </div>
    );
  }

  if (state.state === "not_configured") {
    redirect(`/app/accounts/${accountId}/crm/setup`);
  }

  const { since, until, preset } = resolvePeriod(sp);
  const tab = sp.tab === "deals" ? "deals" : "resumen";
  const page = parseInt(sp.page ?? "1", 10) || 1;
  const status = (sp.status as "open" | "won" | "all") ?? "all";
  const sourceIds = sp.source ? sp.source.split(",").filter(Boolean) : undefined;
  const stageIds = sp.stage ? sp.stage.split(",").filter(Boolean) : undefined;

  const [kpis, breakdown, filterOptions, dealPage] = await Promise.all([
    getCrmKpis(state.connection.id, since, until),
    getCrmBreakdownBySource(state.connection.id, since, until),
    getCrmFilterOptions(state.connection.id),
    getCrmDeals(
      state.connection.id,
      { since, until, sourceExternalIds: sourceIds, stageIds, status },
      page
    ),
  ]);

  return (
    <CrmDashboard
      accountId={accountId}
      accountName={acc[0].name}
      connection={state.connection}
      preset={preset}
      since={since.toISOString().slice(0, 10)}
      until={until.toISOString().slice(0, 10)}
      tab={tab}
      kpis={kpis}
      breakdown={breakdown}
      filterOptions={filterOptions}
      dealPage={dealPage}
      page={page}
      status={status}
      sourceIds={sourceIds ?? []}
      stageIds={stageIds ?? []}
    />
  );
}
