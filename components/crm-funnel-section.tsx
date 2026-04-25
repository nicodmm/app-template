// components/crm-funnel-section.tsx
import type { FunnelRow, CycleTimeStats, StalledDeal } from "@/lib/queries/crm";

function formatMoney(value: number | null, currency: string | null): string {
  if (value === null || currency === null) return "—";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("es-AR")}`;
  }
}

function groupByPipeline(rows: FunnelRow[]): Map<string, FunnelRow[]> {
  const out = new Map<string, FunnelRow[]>();
  for (const r of rows) {
    const existing = out.get(r.pipelineName) ?? [];
    existing.push(r);
    out.set(r.pipelineName, existing);
  }
  return out;
}

export function CrmFunnelSection({
  funnel,
  cycleTime,
  stalled,
}: {
  funnel: { rows: FunnelRow[]; wonInPeriod: number };
  cycleTime: CycleTimeStats;
  stalled: StalledDeal[];
}) {
  const grouped = groupByPipeline(funnel.rows);
  const maxCount = Math.max(1, ...funnel.rows.map((r) => r.openCount), funnel.wonInPeriod);

  return (
    <div className="space-y-8 mt-6">
      {/* Funnel */}
      <section>
        <h2 className="text-sm font-medium mb-2">Embudo por etapa</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Cantidad de deals abiertos actualmente en cada etapa. La barra &ldquo;Ganados&rdquo; muestra los cerrados en el período seleccionado.
        </p>
        {funnel.rows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No hay etapas sincronizadas. Configurá el mapping primero.
          </p>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([pipelineName, rows]) => (
              <div key={pipelineName}>
                {grouped.size > 1 && (
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {pipelineName}
                  </div>
                )}
                <div className="space-y-1">
                  {rows.map((r) => {
                    const pct = (r.openCount / maxCount) * 100;
                    return (
                      <div key={r.stageId} className="flex items-center gap-2 text-xs">
                        <div className="w-40 shrink-0 truncate">
                          {r.stageName}
                          {r.isProposalStage && (
                            <span className="ml-1 text-primary">★</span>
                          )}
                        </div>
                        <div className="flex-1 h-5 bg-muted/30 rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-primary/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-10 text-right tabular-nums font-medium">
                          {r.openCount}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs pt-2 border-t border-border">
              <div className="w-40 shrink-0 truncate text-muted-foreground">Ganados (período)</div>
              <div className="flex-1 h-5 bg-muted/30 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-emerald-500/70"
                  style={{ width: `${(funnel.wonInPeriod / maxCount) * 100}%` }}
                />
              </div>
              <div className="w-10 text-right tabular-nums font-medium">
                {funnel.wonInPeriod}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Cycle time + summary stats */}
      <section className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg p-4 backdrop-blur-[20px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <p className="text-xs text-muted-foreground mb-1">Tiempo promedio de cierre</p>
          <p className="text-2xl font-semibold">
            {cycleTime.avgDays !== null ? `${cycleTime.avgDays} d` : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {cycleTime.wonCount > 0
              ? `Mediana ${cycleTime.medianDays} d · ${cycleTime.wonCount} deals`
              : "Aún no hay deals ganados en este período"}
          </p>
        </div>
        <div className="rounded-lg p-4 backdrop-blur-[20px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <p className="text-xs text-muted-foreground mb-1">Estancados (&gt; 14 días sin mover)</p>
          <p className="text-2xl font-semibold">{stalled.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stalled.length === 0 ? "Ninguno" : "Deals abiertos sin actualización reciente"}
          </p>
        </div>
      </section>

      {/* Stalled deals list */}
      {stalled.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-2">Top deals estancados</h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-3 font-normal">Deal</th>
                  <th className="py-2 px-3 font-normal">Etapa</th>
                  <th className="py-2 px-3 font-normal">Owner</th>
                  <th className="py-2 px-3 font-normal text-right">Valor</th>
                  <th className="py-2 px-3 font-normal text-right">Días</th>
                </tr>
              </thead>
              <tbody>
                {stalled.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="py-2 px-3 font-medium truncate max-w-xs">{d.title}</td>
                    <td className="py-2 px-3">{d.stageName ?? "—"}</td>
                    <td className="py-2 px-3">{d.ownerName ?? "—"}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {formatMoney(d.value, d.currency)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{d.daysStalled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
