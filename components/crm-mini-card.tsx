import Link from "next/link";
import { Target } from "lucide-react";
import {
  getCrmConnectionState,
  getCrmMiniCardKpis,
  type CurrencyBucket,
} from "@/lib/queries/crm";

interface CrmMiniCardProps {
  workspaceId: string;
  accountId: string;
}

function formatMoney(total: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(total);
}

function dominantCurrencyLabel(buckets: CurrencyBucket[]): string {
  if (buckets.length === 0) return "—";
  const sorted = [...buckets].sort((a, b) => b.total - a.total);
  const primary = sorted[0];
  const rest = sorted.slice(1);
  const label = formatMoney(primary.total, primary.currency);
  return rest.length > 0 ? `${label} +${rest.length}` : label;
}

function timeAgo(d: Date | null): string {
  if (!d) return "nunca";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export async function CrmMiniCard({ workspaceId, accountId }: CrmMiniCardProps) {
  const state = await getCrmConnectionState(workspaceId, accountId);

  if (state.state === "no_connection") {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">CRM</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Conectá Pipedrive para ver oportunidades, propuestas y valor del pipeline de esta cuenta.
        </p>
        <Link
          href={`/api/auth/crm/pipedrive/login?accountId=${accountId}`}
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Conectar Pipedrive
        </Link>
      </div>
    );
  }

  if (state.state === "not_configured") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">CRM</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Completá el mapping de pipelines y stages para empezar a ver datos.
        </p>
        <Link
          href={`/app/accounts/${accountId}/crm/setup`}
          className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          Configurar CRM
        </Link>
      </div>
    );
  }

  const kpis = await getCrmMiniCardKpis(state.connection.id);

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">CRM</h2>
          <span className="text-xs text-muted-foreground">· pipeline actual</span>
        </div>
        <Link
          href={`/app/accounts/${accountId}/crm`}
          className="text-xs text-primary hover:underline"
        >
          Ver todo →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground mb-1">Oportunidades</p>
          <p className="text-lg font-semibold">{kpis.oportunidades}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground mb-1">Propuestas</p>
          <p className="text-lg font-semibold">{kpis.propuestas}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground mb-1">Valor pipeline</p>
          <p className="text-lg font-semibold">{dominantCurrencyLabel(kpis.valuePipeline)}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground mb-1">Ganados 30d</p>
          <p className="text-lg font-semibold">{kpis.wonLast30d}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Sync {timeAgo(kpis.lastSyncedAt)} ·{" "}
        <Link
          href={`/app/accounts/${accountId}/crm/setup`}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Configurar
        </Link>
      </p>
    </div>
  );
}
