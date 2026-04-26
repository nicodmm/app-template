import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import { getPaidMediaState } from "@/lib/queries/paid-media";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import { PaidMediaPeriodSelector } from "@/components/paid-media-period-selector";
import { PaidMediaReconnectBanner } from "@/components/paid-media-reconnect-banner";
import { PaidMediaKpiChartModal } from "@/components/paid-media-kpi-chart-modal";
import { PaidMediaResyncButton } from "@/components/paid-media-resync-button";
import { PaidMediaKpisSection } from "@/components/paid-media/kpis-section";
import { PaidMediaCampaignsSection } from "@/components/paid-media/campaigns-section";
import { PaidMediaAdsSection } from "@/components/paid-media/ads-section";
import { PaidMediaChangesSection } from "@/components/paid-media/changes-section";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{
    preset?: string;
    since?: string;
    until?: string;
    chart?: string;
  }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeAgo(d: Date | null): string {
  if (!d) return "nunca";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs} h`;
}

function KpisSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4 animate-pulse">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-lg p-3 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <div className="h-3 w-16 rounded bg-muted/30 mb-2" />
            <div className="h-6 w-20 rounded bg-muted/40" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-8 animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg p-3 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <div className="h-3 w-16 rounded bg-muted/30 mb-2" />
            <div className="h-6 w-20 rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl p-4 mb-4 space-y-2 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-4 w-full rounded bg-muted/30" />
      ))}
    </div>
  );
}

export default async function PaidMediaPage({ params, searchParams }: PageProps) {
  const userId = await requireUserId();
  const { accountId } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [account, state] = await Promise.all([
    getAccountById(accountId, workspace.id),
    getPaidMediaState(workspace.id, accountId),
  ]);
  if (!account) notFound();

  if (state.state !== "mapped") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link
          href={`/app/accounts/${accountId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft size={15} />
          {account.name}
        </Link>
        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold mb-2">Paid Media no configurado</h1>
          <p className="text-sm text-muted-foreground mb-3">
            {state.state === "no_connection"
              ? "Conectá Meta Ads desde Integraciones para empezar."
              : "Vinculá un ad account a esta cuenta."}
          </p>
          <Link
            href={
              state.state === "no_connection"
                ? "/api/auth/meta/login"
                : "/app/settings/integrations"
            }
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {state.state === "no_connection"
              ? "Conectar Meta Ads"
              : "Ir a integraciones"}
          </Link>
        </div>
      </div>
    );
  }

  const today = new Date();
  let since: string;
  let until: string;
  if (sp.preset === "custom" && sp.since && sp.until) {
    since = sp.since;
    until = sp.until;
  } else {
    const days = sp.preset === "14" ? 14 : sp.preset === "30" ? 30 : 7;
    since = isoDate(new Date(today.getTime() - (days - 1) * 86400000));
    until = isoDate(today);
  }

  // Change history uses a fixed 90-day window (independent from the KPI period selector)
  // so users always see recent campaign changes regardless of which period they're analyzing.
  const changeSince = isoDate(new Date(today.getTime() - 89 * 86400000));
  const changeUntil = isoDate(today);

  const currency = state.adAccount.currency;
  const labels = getPaidMediaLabels(state.adAccount.isEcommerce);
  const adAccountId = state.adAccount.id;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link
        href={`/app/accounts/${accountId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        {account.name}
      </Link>

      {state.connectionStatus === "expired" && (
        <div className="mb-6">
          <PaidMediaReconnectBanner />
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Paid Media · {account.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {state.adAccount.name} ({state.adAccount.metaAdAccountId}) · Sync{" "}
            {timeAgo(state.adAccount.lastSyncedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PaidMediaResyncButton adAccountId={adAccountId} />
          <PaidMediaPeriodSelector />
        </div>
      </div>

      {state.adAccount.lastSyncedAt === null && (
        <div className="mb-6 rounded-xl px-4 py-3 text-sm backdrop-blur-[14px] [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
          <p className="font-medium">Sincronización en curso</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            La cuenta publicitaria está conectada pero el primer backfill de 90
            días aún no terminó. Puede tardar entre 1 y 5 minutos. Si seguís
            viendo todo en cero pasado un rato, tocá <strong>Sincronizar
            ahora</strong>.
          </p>
        </div>
      )}

      <Suspense fallback={<KpisSkeleton />}>
        <PaidMediaKpisSection
          adAccountId={adAccountId}
          since={since}
          until={until}
          currency={currency}
          isEcommerce={state.adAccount.isEcommerce}
          labels={labels}
        />
      </Suspense>

      <h2 className="font-semibold mb-3">Campañas</h2>
      <Suspense fallback={<TableSkeleton />}>
        <PaidMediaCampaignsSection
          adAccountId={adAccountId}
          since={since}
          until={until}
          currency={currency}
          isEcommerce={state.adAccount.isEcommerce}
        />
      </Suspense>

      <h2 className="font-semibold mb-3 mt-8">Anuncios activos</h2>
      <Suspense fallback={<TableSkeleton />}>
        <PaidMediaAdsSection
          adAccountId={adAccountId}
          since={since}
          until={until}
          currency={currency}
          isEcommerce={state.adAccount.isEcommerce}
        />
      </Suspense>

      <h2 className="font-semibold mb-3 mt-8">Historial de cambios</h2>
      <Suspense fallback={<TableSkeleton />}>
        <PaidMediaChangesSection
          adAccountId={adAccountId}
          since={changeSince}
          until={changeUntil}
        />
      </Suspense>

      <PaidMediaKpiChartModal
        adAccountId={adAccountId}
        since={since}
        until={until}
        currency={currency}
        metricLabels={{
          spend: labels.spend,
          impressions: labels.impressions,
          reach: labels.reach,
          clicks: labels.clicks,
          conversions: labels.conversions,
          ctr: labels.ctr,
          cpm: labels.cpm,
          cpa: labels.cpa,
          frequency: labels.frequency,
          roas: labels.roas,
        }}
      />
    </div>
  );
}
