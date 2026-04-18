import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { getPaidMediaState, getKpisWithComparison } from "@/lib/queries/paid-media";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import { PaidMediaKpiCard } from "./paid-media-kpi-card";
import { PaidMediaReconnectBanner } from "./paid-media-reconnect-banner";

interface PaidMediaMiniCardProps {
  workspaceId: string;
  accountId: string;
}

function formatMoney(cents: number, currency: string): string {
  const val = cents / 100;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(val);
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

export async function PaidMediaMiniCard({ workspaceId, accountId }: PaidMediaMiniCardProps) {
  const state = await getPaidMediaState(workspaceId, accountId);

  if (state.state === "no_connection") {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Paid Media</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Conectá Meta Ads para ver el performance de las campañas de esta cuenta.
        </p>
        <Link
          href="/api/auth/meta/login"
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Conectar Meta Ads
        </Link>
      </div>
    );
  }

  if (state.state === "no_mapping") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        {state.connectionStatus === "expired" && <PaidMediaReconnectBanner />}
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Paid Media</h2>
        </div>
        <p className="text-sm text-muted-foreground">Vinculá un ad account a esta cuenta.</p>
        <Link
          href="/app/settings/integrations"
          className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          Ir a integraciones
        </Link>
      </div>
    );
  }

  const today = isoDate(new Date());
  const since = isoDate(new Date(Date.now() - 6 * 86400000));
  const { current, deltas } = await getKpisWithComparison(state.adAccount.id, since, today);
  const labels = getPaidMediaLabels(state.adAccount.isEcommerce);

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      {state.connectionStatus === "expired" && <PaidMediaReconnectBanner />}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Paid Media</h2>
          <span className="text-xs text-muted-foreground">· últimos 7 días</span>
        </div>
        <Link
          href={`/app/accounts/${accountId}/paid-media`}
          className="text-xs text-primary hover:underline"
        >
          Ver todo →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <PaidMediaKpiCard
          label={labels.spend}
          value={formatMoney(current.spend, state.adAccount.currency)}
          delta={deltas.spend}
        />
        <PaidMediaKpiCard
          label={state.adAccount.isEcommerce ? "ROAS" : "CPA"}
          value={
            state.adAccount.isEcommerce
              ? current.roas != null
                ? current.roas.toFixed(2) + "x"
                : "—"
              : current.conversions > 0
              ? formatMoney(Math.round(current.cpa * 100), state.adAccount.currency)
              : "—"
          }
          delta={state.adAccount.isEcommerce ? deltas.roas : deltas.cpa}
          invertColors={!state.adAccount.isEcommerce}
        />
        <PaidMediaKpiCard label="CTR" value={`${current.ctr.toFixed(2)}%`} delta={deltas.ctr} />
        <PaidMediaKpiCard
          label={labels.conversions}
          value={current.conversions.toString()}
          delta={deltas.conversions}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Sync {timeAgo(state.adAccount.lastSyncedAt)} ·{" "}
        <Link
          href="/app/settings/integrations"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Configurar
        </Link>
      </p>
    </div>
  );
}
