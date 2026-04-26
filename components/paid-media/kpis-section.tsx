import { getKpisWithComparison } from "@/lib/queries/paid-media";
import { PaidMediaKpiCard } from "@/components/paid-media-kpi-card";
import type { PaidMediaLabels } from "@/lib/meta/labels";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface Props {
  adAccountId: string;
  since: string;
  until: string;
  currency: string;
  isEcommerce: boolean;
  labels: PaidMediaLabels;
}

export async function PaidMediaKpisSection({
  adAccountId,
  since,
  until,
  currency,
  isEcommerce,
  labels,
}: Props) {
  const { current, deltas } = await getKpisWithComparison(
    adAccountId,
    since,
    until
  );

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <PaidMediaKpiCard
          label={labels.spend}
          value={formatMoney(current.spend, currency)}
          delta={deltas.spend}
          metricKey="spend"
        />
        <PaidMediaKpiCard
          label={labels.impressions}
          value={current.impressions.toLocaleString("es-AR")}
          delta={deltas.impressions}
          metricKey="impressions"
        />
        <PaidMediaKpiCard
          label={labels.reach}
          value={current.reach.toLocaleString("es-AR")}
          delta={deltas.reach}
          metricKey="reach"
        />
        <PaidMediaKpiCard
          label={labels.clicks}
          value={current.clicks.toLocaleString("es-AR")}
          delta={deltas.clicks}
          metricKey="clicks"
        />
        <PaidMediaKpiCard
          label={labels.ctr}
          value={`${current.ctr.toFixed(2)}%`}
          delta={deltas.ctr}
          metricKey="ctr"
        />
        <PaidMediaKpiCard
          label={labels.cpm}
          value={
            current.impressions > 0
              ? formatMoney(Math.round(current.cpm * 100), currency)
              : "—"
          }
          delta={deltas.cpm}
          invertColors
          metricKey="cpm"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-8">
        <PaidMediaKpiCard
          label={labels.conversions}
          value={current.conversions.toString()}
          delta={deltas.conversions}
          metricKey="conversions"
        />
        <PaidMediaKpiCard
          label={labels.cpa}
          value={
            current.conversions > 0
              ? formatMoney(Math.round(current.cpa * 100), currency)
              : "—"
          }
          delta={deltas.cpa}
          invertColors
          metricKey="cpa"
        />
        <PaidMediaKpiCard
          label={labels.frequency}
          value={current.frequency.toFixed(2)}
          delta={deltas.frequency}
          invertColors
          metricKey="frequency"
        />
        {isEcommerce && (
          <PaidMediaKpiCard
            label={labels.roas}
            value={current.roas != null ? current.roas.toFixed(2) + "x" : "—"}
            delta={deltas.roas}
            metricKey="roas"
          />
        )}
      </div>
    </>
  );
}
