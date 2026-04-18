"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type {
  CampaignRow,
  AdRow,
  ChangeEventRow,
  DailyWithPrevious,
  MetricKey,
} from "@/lib/queries/paid-media";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import { formatMetricValue, formatMoney } from "@/lib/meta/format";
import { PaidMediaChangeTimeline } from "./paid-media-change-timeline";
import { getCampaignDrawerData } from "@/app/actions/paid-media-drawer";
import { getCampaignChartData } from "@/app/actions/paid-media-chart";

interface PaidMediaCampaignDrawerProps {
  campaign: CampaignRow | null;
  currency: string;
  isEcommerce: boolean;
  since: string;
  until: string;
  onClose: () => void;
}

export function PaidMediaCampaignDrawer({
  campaign,
  currency,
  isEcommerce,
  since,
  until,
  onClose,
}: PaidMediaCampaignDrawerProps) {
  const [trend, setTrend] = useState<DailyWithPrevious | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("spend");
  const [drawerData, setDrawerData] = useState<{ ads: AdRow[]; changes: ChangeEventRow[] } | null>(null);
  const [, startTransition] = useTransition();
  const labels = getPaidMediaLabels(isEcommerce);

  // Reset metric when switching to a different campaign
  useEffect(() => {
    if (campaign) setSelectedMetric("spend");
  }, [campaign?.id]);

  useEffect(() => {
    if (!campaign) { setTrend(null); return; }
    setTrend(null);
    startTransition(async () => {
      const d = await getCampaignChartData(campaign.id, since, until, selectedMetric);
      setTrend(d);
    });
  }, [campaign, since, until, selectedMetric]);

  useEffect(() => {
    if (!campaign) { setDrawerData(null); return; }
    setDrawerData(null);
    startTransition(async () => {
      const d = await getCampaignDrawerData(campaign.id, since, until);
      setDrawerData(d);
    });
  }, [campaign, since, until]);

  if (!campaign) return null;

  const merged =
    trend?.current.map((c, i) => ({
      date: c.date,
      current: c.value,
      previous: trend.previous[i]?.value ?? null,
    })) ?? [];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[560px] bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-5 border-b border-border sticky top-0 bg-background flex items-start justify-between gap-3 z-10">
          <div>
            <h3 className="font-semibold text-sm">{campaign.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {campaign.status} · {campaign.objective ?? "—"}
              {campaign.dailyBudget != null && (
                <> · presupuesto {formatMoney(campaign.dailyBudget, currency)}/día</>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label={labels.spend}
              value={formatMoney(campaign.spend, currency)}
              active={selectedMetric === "spend"}
              onClick={() => setSelectedMetric("spend")}
            />
            <Stat
              label={labels.impressions}
              value={campaign.impressions.toLocaleString("es-AR")}
              active={selectedMetric === "impressions"}
              onClick={() => setSelectedMetric("impressions")}
            />
            <Stat
              label={labels.clicks}
              value={campaign.clicks.toLocaleString("es-AR")}
              active={selectedMetric === "clicks"}
              onClick={() => setSelectedMetric("clicks")}
            />
            <Stat
              label={labels.ctr}
              value={`${campaign.ctr.toFixed(2)}%`}
              active={selectedMetric === "ctr"}
              onClick={() => setSelectedMetric("ctr")}
            />
            <Stat
              label={labels.conversions}
              value={String(campaign.conversions)}
              active={selectedMetric === "conversions"}
              onClick={() => setSelectedMetric("conversions")}
            />
            <Stat
              label={labels.cpa}
              value={
                campaign.conversions > 0
                  ? formatMoney(Math.round(campaign.cpa * 100), currency)
                  : "—"
              }
              active={selectedMetric === "cpa"}
              onClick={() => setSelectedMetric("cpa")}
            />
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">
              {(labels as Record<string, string>)[selectedMetric] ?? selectedMetric} diario
            </h4>
            <div className="h-[220px]">
              {!trend ? (
                <p className="text-xs text-muted-foreground">Cargando…</p>
              ) : merged.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin datos en el período.</p>
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
            <h3 className="text-sm font-medium mb-2">Anuncios de esta campaña</h3>
            {drawerData === null ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : drawerData.ads.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin anuncios con actividad en el período.
              </p>
            ) : (
              <ul className="rounded-lg border border-border bg-card divide-y divide-border">
                {drawerData.ads.map((ad) => (
                  <li key={ad.id} className="p-2 flex items-center gap-3">
                    <Thumbnail src={ad.thumbnailUrl} alt={ad.name} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{ad.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatMoney(ad.spend, currency)} · {ad.ctr.toFixed(2)}%{" "}
                        {labels.ctr.toLowerCase()} · {ad.conversions}{" "}
                        {labels.conversions.toLowerCase()}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Cambios recientes</h3>
            {drawerData === null ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : drawerData.changes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin cambios registrados.</p>
            ) : (
              <PaidMediaChangeTimeline
                events={drawerData.changes}
                totalAvailable={drawerData.changes.length}
              />
            )}
          </div>
        </div>
      </div>
    </>
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

function Thumbnail({ src, alt, size }: { src: string | null; alt: string; size: number }) {
  if (!src) {
    return (
      <div
        className="rounded-md bg-muted flex items-center justify-center text-muted-foreground text-xs flex-shrink-0"
        style={{ width: size, height: size }}
        aria-label="Sin preview"
      >
        🖼️
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className="rounded-md object-cover bg-muted flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
