"use client";

import { useEffect, useState, useTransition } from "react";
import { getAssetVariantsForAdAction } from "@/app/actions/paid-media-drawer";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import { formatMoney } from "@/lib/meta/format";
import type { AssetVariantRow } from "@/lib/queries/paid-media";

interface Props {
  adId: string;
  since: string;
  until: string;
  currency: string;
  isEcommerce: boolean;
  onRowClick: (imageUrl: string) => void;
}

export function PaidMediaAssetVariantsSection({
  adId,
  since,
  until,
  currency,
  isEcommerce,
  onRowClick,
}: Props) {
  const labels = getPaidMediaLabels(isEcommerce);
  const [rows, setRows] = useState<AssetVariantRow[] | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setRows(null);
    startTransition(async () => {
      const data = await getAssetVariantsForAdAction(adId, since, until);
      setRows(data);
    });
  }, [adId, since, until]);

  if (rows === null) return null; // loading: render nothing (no flicker)
  if (rows.length === 0) return null; // non-DCO ad

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium mb-2">{labels.assetVariants}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal py-1 pr-2">&nbsp;</th>
              <th className="text-left font-normal py-1 pr-2">{labels.assetName}</th>
              <th className="text-right font-normal py-1 pr-2 tabular-nums">{labels.spend}</th>
              <th className="text-right font-normal py-1 pr-2 tabular-nums">{labels.impressions}</th>
              <th className="text-right font-normal py-1 pr-2 tabular-nums">{labels.clicks}</th>
              <th className="text-right font-normal py-1 pr-2 tabular-nums">{labels.ctr}</th>
              <th className="text-right font-normal py-1 pr-2 tabular-nums">{labels.conversions}</th>
              <th className="text-right font-normal py-1 tabular-nums">{labels.cpa}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const clickTarget = r.imageUrl ?? r.thumbnailUrl;
              const clickable = !!clickTarget;
              return (
                <tr
                  key={r.id}
                  className={`border-t border-border ${
                    clickable ? "cursor-pointer hover:bg-accent/30" : ""
                  }`}
                  onClick={clickable ? () => onRowClick(clickTarget) : undefined}
                >
                  <td className="py-1 pr-2">
                    {r.thumbnailUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.thumbnailUrl}
                        alt={r.name ?? r.metaAssetHash}
                        loading="lazy"
                        className="w-10 h-10 object-cover rounded border border-border"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded border border-border bg-muted" />
                    )}
                  </td>
                  <td className="py-1 pr-2 font-medium">
                    {r.name ?? r.metaAssetHash.slice(0, 12)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatMoney(r.spend, currency)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {r.impressions.toLocaleString("es-AR")}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {r.clicks.toLocaleString("es-AR")}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {r.ctr.toFixed(2)}%
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {r.conversions.toLocaleString("es-AR")}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.conversions > 0
                      ? formatMoney(Math.round(r.cpa * 100), currency)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
