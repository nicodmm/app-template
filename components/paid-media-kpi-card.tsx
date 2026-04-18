import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

interface PaidMediaKpiCardProps {
  label: string;
  value: string;
  delta?: number | null;
  invertColors?: boolean;
}

export function PaidMediaKpiCard({ label, value, delta, invertColors }: PaidMediaKpiCardProps) {
  const deltaFormatted = delta == null ? null : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  const isPositive = delta != null && delta >= 0;
  const isGood = invertColors ? !isPositive : isPositive;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
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
}
