import type { MetricKey } from "@/lib/queries/paid-media";

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatMetricValue(
  metric: MetricKey,
  value: number,
  currency: string
): string {
  if (metric === "spend" || metric === "cpm" || metric === "cpa") {
    return formatMoney(Math.round(value * 100), currency);
  }
  if (metric === "ctr") return `${value.toFixed(2)}%`;
  if (metric === "frequency") return value.toFixed(2);
  if (metric === "roas") return `${value.toFixed(2)}x`;
  return Math.round(value).toLocaleString("es-AR");
}
