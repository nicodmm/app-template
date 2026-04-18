import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import {
  getPaidMediaState,
  getKpisWithComparison,
  getCampaignsWithKpis,
} from "@/lib/queries/paid-media";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import { PaidMediaKpiCard } from "@/components/paid-media-kpi-card";
import { PaidMediaPeriodSelector } from "@/components/paid-media-period-selector";
import { PaidMediaCampaignsTable } from "@/components/paid-media-campaigns-table";
import { PaidMediaReconnectBanner } from "@/components/paid-media-reconnect-banner";
import { PaidMediaKpiChartModal } from "@/components/paid-media-kpi-chart-modal";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ preset?: string; since?: string; until?: string; chart?: string }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
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

export default async function PaidMediaPage({ params, searchParams }: PageProps) {
  const userId = await requireUserId();
  const { accountId } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const account = await getAccountById(accountId, workspace.id);
  if (!account) notFound();

  const state = await getPaidMediaState(workspace.id, accountId);
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
            {state.state === "no_connection" ? "Conectar Meta Ads" : "Ir a integraciones"}
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

  const [{ current, deltas }, campaigns] = await Promise.all([
    getKpisWithComparison(state.adAccount.id, since, until),
    getCampaignsWithKpis(state.adAccount.id, since, until),
  ]);

  const currency = state.adAccount.currency;
  const labels = getPaidMediaLabels(state.adAccount.isEcommerce);

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
        <PaidMediaPeriodSelector />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <PaidMediaKpiCard
          label={labels.spend}
          value={formatMoney(current.spend, currency)}
          delta={deltas.spend}
          metricKey="spend"
        />
        <PaidMediaKpiCard
          label={labels.impressions}
          value={current.impressions.toLocaleString("es-AR")}
          delta={deltas.impressions}
          metricKey="impressions"
        />
        <PaidMediaKpiCard
          label={labels.reach}
          value={current.reach.toLocaleString("es-AR")}
          delta={deltas.reach}
          metricKey="reach"
        />
        <PaidMediaKpiCard
          label={labels.clicks}
          value={current.clicks.toLocaleString("es-AR")}
          delta={deltas.clicks}
          metricKey="clicks"
        />
        <PaidMediaKpiCard
          label={labels.ctr}
          value={`${current.ctr.toFixed(2)}%`}
          delta={deltas.ctr}
          metricKey="ctr"
        />
        <PaidMediaKpiCard
          label={labels.cpm}
          value={
            current.impressions > 0
              ? formatMoney(Math.round(current.cpm * 100), currency)
              : "—"
          }
          delta={deltas.cpm}
          invertColors
          metricKey="cpm"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-8">
        <PaidMediaKpiCard
          label={labels.conversions}
          value={current.conversions.toString()}
          delta={deltas.conversions}
          metricKey="conversions"
        />
        <PaidMediaKpiCard
          label={labels.cpa}
          value={
            current.conversions > 0
              ? formatMoney(Math.round(current.cpa * 100), currency)
              : "—"
          }
          delta={deltas.cpa}
          invertColors
          metricKey="cpa"
        />
        <PaidMediaKpiCard
          label={labels.frequency}
          value={current.frequency.toFixed(2)}
          delta={deltas.frequency}
          invertColors
          metricKey="frequency"
        />
        {state.adAccount.isEcommerce && (
          <PaidMediaKpiCard
            label={labels.roas}
            value={current.roas != null ? current.roas.toFixed(2) + "x" : "—"}
            delta={deltas.roas}
            metricKey="roas"
          />
        )}
      </div>

      <h2 className="font-semibold mb-3">Campañas</h2>
      <PaidMediaCampaignsTable
        campaigns={campaigns}
        currency={currency}
        isEcommerce={state.adAccount.isEcommerce}
      />

      <PaidMediaKpiChartModal
        adAccountId={state.adAccount.id}
        since={since}
        until={until}
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
        formatValue={(metric, v) => {
          if (["spend", "cpm", "cpa"].includes(metric))
            return formatMoney(Math.round(v * 100), currency);
          if (metric === "ctr") return `${v.toFixed(2)}%`;
          if (metric === "frequency") return v.toFixed(2);
          if (metric === "roas") return v.toFixed(2) + "x";
          return Math.round(v).toLocaleString("es-AR");
        }}
      />
    </div>
  );
}
