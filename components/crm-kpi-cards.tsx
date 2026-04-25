// components/crm-kpi-cards.tsx
import type { CrmKpis, CurrencyBucket } from "@/lib/queries/crm";

function formatMoneyLike(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-AR")}`;
  }
}

function sortBuckets(buckets: CurrencyBucket[]): CurrencyBucket[] {
  return [...buckets].sort((a, b) => b.total - a.total);
}

function renderBuckets(buckets: CurrencyBucket[]): React.ReactNode {
  if (buckets.length === 0) return <span className="text-muted-foreground">—</span>;
  const sorted = sortBuckets(buckets);
  const [primary, ...rest] = sorted;
  return (
    <div>
      <div className="text-lg font-semibold">{formatMoneyLike(primary.total, primary.currency)}</div>
      {rest.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {rest.map((b) => formatMoneyLike(b.total, b.currency)).join(" · ")}
        </div>
      )}
    </div>
  );
}

export function CrmKpiCards({ kpis }: { kpis: CrmKpis }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Card label="Deals creados" value={<div className="text-lg font-semibold">{kpis.createdCount}</div>} />
      <Card label="Deals ganados" value={<div className="text-lg font-semibold">{kpis.wonCount}</div>} />
      <Card label="Valor abierto" value={renderBuckets(kpis.valueOpen)} />
      <Card label="Valor ganado" value={renderBuckets(kpis.valueWon)} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg p-3 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {value}
    </div>
  );
}
