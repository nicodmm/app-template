"use client";

import { useState } from "react";
import { PaidMediaAdDrawer } from "./paid-media-ad-drawer";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import { formatMoney } from "@/lib/meta/format";
import type { AdRow } from "@/lib/queries/paid-media";
import { PublicNameEditor } from "@/components/paid-media/public-name-editor";
import { setPublicAdName } from "@/app/actions/share-links";

interface Props {
  ads: AdRow[];
  currency: string;
  isEcommerce: boolean;
  adAccountId: string;
  since: string;
  until: string;
}

export function PaidMediaAdsTable({ ads, currency, isEcommerce, adAccountId, since, until }: Props) {
  const labels = getPaidMediaLabels(isEcommerce);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const selectedAd = selectedAdId ? ads.find((a) => a.id === selectedAdId) ?? null : null;

  const sorted = [...ads].sort((a, b) => b.spend - a.spend);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl p-6 text-sm text-muted-foreground backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        No hay anuncios con gasto o resultados en el período seleccionado.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl overflow-hidden backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        <table className="w-full text-sm">
          <thead className="bg-white/30 dark:bg-white/5">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Anuncio</th>
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
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Thumbnail
                      src={ad.thumbnailUrl ? `/api/meta/image/ad/${ad.id}` : null}
                      alt={ad.name}
                      size={56}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        <PublicNameEditor
                          entityId={ad.id}
                          internalName={ad.name}
                          initialPublicName={ad.publicName}
                          onSave={setPublicAdName}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {ad.campaignName}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{ad.status}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {formatMoney(ad.spend, currency)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {ad.impressions.toLocaleString("es-AR")}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {ad.clicks.toLocaleString("es-AR")}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{ad.ctr.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{ad.conversions}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
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
