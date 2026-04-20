// components/crm-summary-tab.tsx
import { CrmKpiCards } from "./crm-kpi-cards";
import type { CrmKpis, SourceBreakdownRow, CurrencyBucket } from "@/lib/queries/crm";

function moneyRow(buckets: CurrencyBucket[]): string {
  if (buckets.length === 0) return "—";
  return buckets
    .slice()
    .sort((a, b) => b.total - a.total)
    .map((b) => {
      try {
        return new Intl.NumberFormat("es-AR", { style: "currency", currency: b.currency, maximumFractionDigits: 0 }).format(b.total);
      } catch {
        return `${b.currency} ${b.total.toLocaleString("es-AR")}`;
      }
    })
    .join(" · ");
}

export function CrmSummaryTab({
  kpis,
  breakdown,
}: {
  kpis: CrmKpis;
  breakdown: SourceBreakdownRow[];
}) {
  return (
    <div>
      <CrmKpiCards kpis={kpis} />
      <h2 className="text-sm font-medium mb-2">Breakdown por fuente</h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="py-2 px-3 font-normal">Fuente</th>
              <th className="py-2 px-3 font-normal text-right">Creados</th>
              <th className="py-2 px-3 font-normal text-right">Ganados</th>
              <th className="py-2 px-3 font-normal text-right">Valor abierto</th>
              <th className="py-2 px-3 font-normal text-right">Valor ganado</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 px-3 text-center text-muted-foreground">
                  No hay deals en este período.
                </td>
              </tr>
            ) : (
              breakdown.map((r) => (
                <tr key={r.sourceExternalId ?? "none"} className="border-t border-border">
                  <td className="py-2 px-3 font-medium">{r.sourceName}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.createdCount}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.wonCount}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{moneyRow(r.valueOpen)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{moneyRow(r.valueWon)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
