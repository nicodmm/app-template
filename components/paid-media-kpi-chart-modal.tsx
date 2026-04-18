"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getKpiChartData } from "@/app/actions/paid-media-chart";
import type { DailyWithPrevious, MetricKey } from "@/lib/queries/paid-media";

interface Props {
  adAccountId: string;
  since: string;
  until: string;
  metricLabels: Partial<Record<MetricKey, string>>;
  formatValue: (metric: MetricKey, value: number) => string;
}

export function PaidMediaKpiChartModal({
  adAccountId,
  since,
  until,
  metricLabels,
  formatValue,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chartParam = searchParams.get("chart") as MetricKey | null;
  const [data, setData] = useState<DailyWithPrevious | null>(null);
  const [, startTransition] = useTransition();

  const close = () => {
    const qp = new URLSearchParams(searchParams);
    qp.delete("chart");
    router.push(`?${qp.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (!chartParam) {
      setData(null);
      return;
    }
    setData(null);
    startTransition(async () => {
      const d = await getKpiChartData(adAccountId, since, until, chartParam);
      setData(d);
    });
  }, [chartParam, adAccountId, since, until]);

  useEffect(() => {
    if (!chartParam) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartParam]);

  if (!chartParam) return null;

  const label = metricLabels[chartParam] ?? chartParam;

  // Rekey previous series by day-offset-from-start so both align on X axis.
  const merged =
    data?.current.map((c, i) => ({
      date: c.date,
      current: c.value,
      previous: data.previous[i]?.value ?? null,
    })) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{label}</h2>
            {data && (
              <p className="text-sm text-muted-foreground">
                {formatValue(chartParam, data.totals.current)} actual ·{" "}
                {formatValue(chartParam, data.totals.previous)} anterior
                {data.totals.deltaPct != null && (
                  <>
                    {" "}
                    ·{" "}
                    <span
                      className={
                        data.totals.deltaPct >= 0 ? "text-emerald-600" : "text-red-600"
                      }
                    >
                      {data.totals.deltaPct >= 0 ? "+" : ""}
                      {data.totals.deltaPct.toFixed(1)}%
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
          >
            Cerrar
          </button>
        </div>

        <div className="h-80">
          {!data ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Cargando…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merged}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number" ? formatValue(chartParam, v) : String(v)
                  }
                  labelFormatter={(l) => l}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="Actual"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="Período anterior"
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
