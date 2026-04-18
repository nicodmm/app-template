"use client";

import { useEffect, useState, useTransition } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getAdChartData } from "@/app/actions/paid-media-chart";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import { formatMetricValue, formatMoney } from "@/lib/meta/format";
import type { AdRow, DailyWithPrevious, MetricKey } from "@/lib/queries/paid-media";

interface Props {
  ad: AdRow | null;
  onClose: () => void;
  adAccountId: string;
  currency: string;
  isEcommerce: boolean;
  since: string;
  until: string;
}

export function PaidMediaAdDrawer({ ad, onClose, adAccountId, currency, isEcommerce, since, until }: Props) {
  const labels = getPaidMediaLabels(isEcommerce);
  const [trend, setTrend] = useState<DailyWithPrevious | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("spend");
  const [, startTransition] = useTransition();

  // Reset metric when switching to a different ad
  useEffect(() => {
    if (ad) setSelectedMetric("spend");
  }, [ad?.id]);

  useEffect(() => {
    if (!ad) { setTrend(null); return; }
    setTrend(null);
    startTransition(async () => {
      const d = await getAdChartData(adAccountId, ad.id, since, until, selectedMetric);
      setTrend(d);
    });
  }, [ad, adAccountId, since, until, selectedMetric]);

  useEffect(() => {
    if (!ad) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ad, onClose]);

  if (!ad) return null;

  const merged =
    trend?.current.map((c, i) => ({
      date: c.date,
      current: c.value,
      previous: trend.previous[i]?.value ?? null,
    })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex-1 bg-black/50" />
      <aside
        className="w-full max-w-xl overflow-y-auto border-l border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{ad.name}</h2>
            <p className="text-xs text-muted-foreground">
              {ad.campaignName} · {ad.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
          >
            Cerrar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          <Stat
            label={labels.spend}
            value={formatMoney(ad.spend, currency)}
            active={selectedMetric === "spend"}
            onClick={() => setSelectedMetric("spend")}
          />
          <Stat
            label={labels.impressions}
            value={ad.impressions.toLocaleString("es-AR")}
            active={selectedMetric === "impressions"}
            onClick={() => setSelectedMetric("impressions")}
          />
          <Stat
            label={labels.clicks}
            value={ad.clicks.toLocaleString("es-AR")}
            active={selectedMetric === "clicks"}
            onClick={() => setSelectedMetric("clicks")}
          />
          <Stat
            label={labels.ctr}
            value={`${ad.ctr.toFixed(2)}%`}
            active={selectedMetric === "ctr"}
            onClick={() => setSelectedMetric("ctr")}
          />
          <Stat
            label={labels.conversions}
            value={String(ad.conversions)}
            active={selectedMetric === "conversions"}
            onClick={() => setSelectedMetric("conversions")}
          />
          <Stat
            label={labels.cpa}
            value={ad.conversions > 0 ? formatMoney(Math.round(ad.cpa * 100), currency) : "—"}
            active={selectedMetric === "cpa"}
            onClick={() => setSelectedMetric("cpa")}
          />
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">
            {(labels as Record<string, string>)[selectedMetric] ?? selectedMetric} diario
          </h3>
          <div className="h-52">
            {!trend ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Cargando…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v) =>
                      typeof v === "number"
                        ? formatMetricValue(selectedMetric, v, currency)
                        : String(v)
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="current"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="previous"
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

        <div>
          <h3 className="text-sm font-medium mb-2">Creatividad</h3>
          <p className="text-xs text-muted-foreground">
            Creative ID: {ad.creativeId ?? "—"} (preview no disponible en esta versión)
          </p>
        </div>
      </aside>
    </div>
  );
}

function Stat({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-2 transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:bg-accent/30"
      }`}
    >
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </button>
  );
}
