"use client";

import { useState } from "react";
import { PaidMediaAdDrawer } from "./paid-media-ad-drawer";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import type { AdRow } from "@/lib/queries/paid-media";

interface Props {
  ads: AdRow[];
  currency: string;
  isEcommerce: boolean;
  adAccountId: string;
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

export function PaidMediaAdsTable({ ads, currency, isEcommerce, adAccountId, since, until }: Props) {
  const labels = getPaidMediaLabels(isEcommerce);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const selectedAd = selectedAdId ? ads.find((a) => a.id === selectedAdId) ?? null : null;

  const sorted = [...ads].sort((a, b) => b.spend - a.spend);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No hay anuncios con gasto o resultados en el período seleccionado.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Campaña</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium text-right">{labels.spend}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.impressions}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.clicks}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.ctr}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.conversions}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.cpa}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ad) => (
              <tr
                key={ad.id}
                className="border-t border-border hover:bg-accent/30 cursor-pointer"
                onClick={() => setSelectedAdId(ad.id)}
              >
                <td className="px-3 py-2 truncate max-w-xs">{ad.name}</td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-[10rem]">
                  {ad.campaignName}
                </td>
                <td className="px-3 py-2 text-xs">{ad.status}</td>
                <td className="px-3 py-2 text-right">{formatMoney(ad.spend, currency)}</td>
                <td className="px-3 py-2 text-right">{ad.impressions.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-right">{ad.clicks.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-right">{ad.ctr.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right">{ad.conversions}</td>
                <td className="px-3 py-2 text-right">
                  {ad.conversions > 0 ? formatMoney(Math.round(ad.cpa * 100), currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaidMediaAdDrawer
        ad={selectedAd}
        onClose={() => setSelectedAdId(null)}
        adAccountId={adAccountId}
        currency={currency}
        isEcommerce={isEcommerce}
        since={since}
        until={until}
      />
    </>
  );
}
