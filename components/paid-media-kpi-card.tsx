"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { MetricKey } from "@/lib/queries/paid-media";

interface PaidMediaKpiCardProps {
  label: string;
  value: string;
  delta?: number | null;
  invertColors?: boolean;
  metricKey?: MetricKey;
}

export function PaidMediaKpiCard({
  label,
  value,
  delta,
  invertColors,
  metricKey,
}: PaidMediaKpiCardProps) {
  const searchParams = useSearchParams();
  const deltaFormatted = delta == null ? null : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  const isPositive = delta != null && delta >= 0;
  const isGood = invertColors ? !isPositive : isPositive;

  const cardBody = (
    <div
      className={`rounded-lg p-3 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]${
        metricKey
          ? " transition-colors hover:bg-white/30 dark:hover:bg-white/10 cursor-pointer"
          : ""
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5 font-mono tabular-nums">{value}</p>
      {deltaFormatted && (
        <p
          className={`text-xs flex items-center gap-0.5 mt-0.5 ${
            delta === 0
              ? "text-muted-foreground"
              : isGood
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {delta != null && delta !== 0 &&
            (isPositive ? <ArrowUpIcon size={10} /> : <ArrowDownIcon size={10} />)}
          {deltaFormatted}
        </p>
      )}
    </div>
  );

  if (!metricKey) return cardBody;

  const qp = new URLSearchParams(searchParams);
  qp.set("chart", metricKey);
  return (
    <Link href={`?${qp.toString()}`} scroll={false} aria-label={`Ver gráfico de ${label}`}>
      {cardBody}
    </Link>
  );
}
