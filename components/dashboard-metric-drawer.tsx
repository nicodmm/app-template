"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { fetchDashboardBreakdown } from "@/app/actions/dashboard";
import type {
  DashboardBreakdown,
  DashboardBreakdownRow,
  DashboardMetricKey,
  DashboardPeriod,
} from "@/lib/queries/dashboard";

interface DashboardMetricDrawerProps {
  metric: DashboardMetricKey | null;
  metricLabel: string | null;
  period: DashboardPeriod;
  formatValue: (value: number) => string;
  onClose: () => void;
}

export function DashboardMetricDrawer({
  metric,
  metricLabel,
  period,
  formatValue,
  onClose,
}: DashboardMetricDrawerProps) {
  const [data, setData] = useState<DashboardBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!metric) {
      setData(null);
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await fetchDashboardBreakdown(metric, period);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    });
  }, [metric, period]);

  useEffect(() => {
    if (!metric) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [metric, onClose]);

  if (!metric) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Detalle de ${metricLabel ?? metric}`}
        className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col [background:var(--glass-bg)] backdrop-blur-[18px] [border-left:1px_solid_var(--glass-border)] [box-shadow:-12px_0_32px_-12px_rgba(0,0,0,0.18)]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 [border-bottom:1px_solid_var(--glass-border)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Desglose
            </p>
            <h2 className="text-base font-semibold">{metricLabel ?? metric}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-accent transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-6">
          {isPending && (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          )}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      const result = await fetchDashboardBreakdown(
                        metric,
                        period
                      );
                      setData(result);
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Error desconocido"
                      );
                    }
                  });
                }}
                className="mt-2 text-xs font-medium underline"
              >
                Reintentar
              </button>
            </div>
          )}
          {data && !isPending && !error && (
            <>
              <BreakdownSection
                title="Por servicio"
                rows={data.byService}
                formatValue={formatValue}
              />
              <BreakdownSection
                title="Por industria"
                rows={data.byIndustry}
                formatValue={formatValue}
              />
              <BreakdownSection
                title="Por tamaño"
                rows={data.bySize}
                formatValue={formatValue}
              />
              {data.byOwner.length > 0 && (
                <BreakdownSection
                  title="Por responsable"
                  rows={data.byOwner}
                  formatValue={formatValue}
                />
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function BreakdownSection({
  title,
  rows,
  formatValue,
}: {
  title: string;
  rows: DashboardBreakdownRow[];
  formatValue: (value: number) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li
            key={`${title}-${r.label}`}
            className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <div>
              <span>{r.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {r.accountsCount} cuenta{r.accountsCount !== 1 ? "s" : ""}
              </span>
            </div>
            <span className="font-semibold tabular-nums">
              {formatValue(r.value)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
