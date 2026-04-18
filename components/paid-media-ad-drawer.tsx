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
import type { AdRow, DailyWithPrevious } from "@/lib/queries/paid-media";

interface Props {
  ad: AdRow | null;
  onClose: () => void;
  adAccountId: string;
  currency: string;
  isEcommerce: boolean;
  since: string;
  until: string;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PaidMediaAdDrawer({ ad, onClose, adAccountId, currency, isEcommerce, since, until }: Props) {
  const labels = getPaidMediaLabels(isEcommerce);
  const [trend, setTrend] = useState<DailyWithPrevious | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!ad) { setTrend(null); return; }
    setTrend(null);
    startTransition(async () => {
      const d = await getAdChartData(adAccountId, ad.id, since, until, "spend");
      setTrend(d);
    });
  }, [ad, adAccountId, since, until]);

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
          <Stat label={labels.spend} value={formatMoney(ad.spend, currency)} />
          <Stat label={labels.impressions} value={ad.impressions.toLocaleString("es-AR")} />
          <Stat label={labels.clicks} value={ad.clicks.toLocaleString("es-AR")} />
          <Stat label={labels.ctr} value={`${ad.ctr.toFixed(2)}%`} />
          <Stat label={labels.conversions} value={String(ad.conversions)} />
          <Stat
            label={labels.cpa}
            value={ad.conversions > 0 ? formatMoney(Math.round(ad.cpa * 100), currency) : "—"}
          />
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">{labels.spend} diario</h3>
          <div className="h-52">
            {!trend ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Cargando…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v) =>
                      typeof v === "number"
                        ? formatMoney(Math.round(v * 100), currency)
                        : String(v)
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="current"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="previous"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
