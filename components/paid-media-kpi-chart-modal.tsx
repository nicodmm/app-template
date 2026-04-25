"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
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
import { formatMetricValue } from "@/lib/meta/format";
import type { DailyWithPrevious, MetricKey } from "@/lib/queries/paid-media";

interface Props {
  adAccountId: string;
  since: string;
  until: string;
  currency: string;
  metricLabels: Partial<Record<MetricKey, string>>;
}

export function PaidMediaKpiChartModal({
  adAccountId,
  since,
  until,
  currency,
  metricLabels,
}: Props) {
  const searchParams = useSearchParams();
  const urlChart = searchParams.get("chart") as MetricKey | null;
  const [chartParam, setChartParam] = useState<MetricKey | null>(urlChart);
  const [data, setData] = useState<DailyWithPrevious | null>(null);
  const [, startTransition] = useTransition();

  // Sync URL → local state (covers deep-linking and back/forward navigation)
  useEffect(() => {
    setChartParam(urlChart);
  }, [urlChart]);

  const close = () => {
    setChartParam(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("chart");
      window.history.replaceState(null, "", url.toString());
    }
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-card p-6 [border:1px_solid_var(--border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{label}</h2>
            {data && (
              <p className="text-sm text-muted-foreground">
                {formatMetricValue(chartParam, data.totals.current, currency)} actual ·{" "}
                {formatMetricValue(chartParam, data.totals.previous, currency)} anterior
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number"
                      ? formatMetricValue(chartParam, v, currency)
                      : String(v)
                  }
                  labelFormatter={(l) => l}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="Actual"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="Período anterior"
                  stroke="var(--muted-foreground)"
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
