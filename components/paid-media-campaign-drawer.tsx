"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CampaignRow, CampaignTrendPoint } from "@/lib/queries/paid-media";

interface PaidMediaCampaignDrawerProps {
  campaign: CampaignRow | null;
  currency: string;
  onClose: () => void;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PaidMediaCampaignDrawer({
  campaign,
  currency,
  onClose,
}: PaidMediaCampaignDrawerProps) {
  const [trend, setTrend] = useState<CampaignTrendPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    setLoading(true);
    fetch(`/api/paid-media/campaign-trend?campaignId=${campaign.id}`)
      .then((r) => r.json())
      .then((data: { trend: CampaignTrendPoint[] }) => {
        setTrend([...data.trend].reverse());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [campaign]);

  if (!campaign) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[500px] bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-5 border-b border-border sticky top-0 bg-background flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">{campaign.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {campaign.status} · {campaign.objective ?? "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Spend</p>
              <p className="text-sm font-medium">{formatMoney(campaign.spend, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conv.</p>
              <p className="text-sm font-medium">{campaign.conversions}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CPA</p>
              <p className="text-sm font-medium">
                {campaign.conversions > 0
                  ? formatMoney(Math.round(campaign.cpa * 100), currency)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CTR</p>
              <p className="text-sm font-medium">{campaign.ctr.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CPC</p>
              <p className="text-sm font-medium">
                {campaign.clicks > 0
                  ? formatMoney(Math.round(campaign.cpc * 100), currency)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Freq</p>
              <p className="text-sm font-medium">{campaign.frequency.toFixed(2)}</p>
            </div>
            <div className="col-span-3">
              <p className="text-xs text-muted-foreground">Daily budget</p>
              <p className="text-sm font-medium">
                {campaign.dailyBudget != null
                  ? formatMoney(campaign.dailyBudget, currency)
                  : "sin tope diario"}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Últimos 30 días</h4>
            <div className="h-[220px]">
              {loading ? (
                <p className="text-xs text-muted-foreground">Cargando...</p>
              ) : trend.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin datos.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(5)}
                      fontSize={10}
                    />
                    <YAxis yAxisId="spend" orientation="left" fontSize={10} />
                    <YAxis yAxisId="conv" orientation="right" fontSize={10} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      yAxisId="spend"
                      type="monotone"
                      dataKey="spend"
                      name="Spend (cents)"
                      stroke="#6366f1"
                      dot={false}
                    />
                    <Line
                      yAxisId="conv"
                      type="monotone"
                      dataKey="conversions"
                      name="Conv."
                      stroke="#10b981"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
