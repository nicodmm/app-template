import Link from "next/link";
import { Target, ArrowRight } from "lucide-react";
import {
  getCrmConnectionState,
  getCrmMiniCardKpis,
  type CurrencyBucket,
} from "@/lib/queries/crm";
import { GlassCard } from "@/components/ui/glass-card";

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

const TILE_CLASS =
  "rounded-lg p-3 [background:rgba(255,255,255,0.4)] dark:[background:rgba(255,255,255,0.04)] [border:1px_solid_var(--glass-border)]";

export async function CrmMiniCard({ workspaceId, accountId }: CrmMiniCardProps) {
  const state = await getCrmConnectionState(workspaceId, accountId);

  if (state.state === "no_connection") {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">CRM</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Conectá Pipedrive para ver oportunidades, propuestas y valor del pipeline de esta cuenta.
        </p>
        <Link
          href={`/api/auth/crm/pipedrive/login?accountId=${accountId}`}
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
        >
          Conectar Pipedrive
        </Link>
      </GlassCard>
    );
  }

  if (state.state === "not_configured") {
    return (
      <GlassCard className="p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">CRM</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Completá el mapping de pipelines y stages para empezar a ver datos.
        </p>
        <Link
          href={`/app/accounts/${accountId}/crm/setup`}
          className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10"
        >
          Configurar CRM
        </Link>
      </GlassCard>
    );
  }

  const kpis = await getCrmMiniCardKpis(state.connection.id);

  return (
    <GlassCard className="p-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">CRM</h2>
          <span className="text-xs text-muted-foreground">· pipeline actual</span>
        </div>
        <Link
          href={`/app/accounts/${accountId}/crm`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Ver todo <ArrowRight size={11} aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={TILE_CLASS}>
          <p className="text-xs text-muted-foreground mb-1">Oportunidades</p>
          <p className="text-lg font-semibold font-mono tabular-nums">{kpis.oportunidades}</p>
        </div>
        <div className={TILE_CLASS}>
          <p className="text-xs text-muted-foreground mb-1">Propuestas</p>
          <p className="text-lg font-semibold font-mono tabular-nums">{kpis.propuestas}</p>
        </div>
        <div className={TILE_CLASS}>
          <p className="text-xs text-muted-foreground mb-1">Valor pipeline</p>
          <p className="text-lg font-semibold font-mono tabular-nums">
            {dominantCurrencyLabel(kpis.valuePipeline)}
          </p>
        </div>
        <div className={TILE_CLASS}>
          <p className="text-xs text-muted-foreground mb-1">Ganados 30d</p>
          <p className="text-lg font-semibold font-mono tabular-nums">{kpis.wonLast30d}</p>
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
    </GlassCard>
  );
}
