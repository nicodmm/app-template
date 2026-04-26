"use client";

import { cn } from "@/lib/utils";
import type { HealthBucket } from "@/lib/queries/dashboard";

const BUCKET_CONFIG: Record<
  HealthBucket,
  { label: string; barClass: string; pillClass: string }
> = {
  green: {
    label: "Al día",
    barClass: "bg-emerald-500",
    pillClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  yellow: {
    label: "Atención",
    barClass: "bg-amber-500",
    pillClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  red: {
    label: "En riesgo",
    barClass: "bg-red-600",
    pillClass: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  inactive: {
    label: "Sin actividad",
    barClass: "bg-slate-400",
    pillClass: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  },
};

interface DashboardHealthDistributionProps {
  distribution: Record<HealthBucket, number>;
}

export function DashboardHealthDistribution({
  distribution,
}: DashboardHealthDistributionProps) {
  const total =
    distribution.green +
    distribution.yellow +
    distribution.red +
    distribution.inactive;
  const order: HealthBucket[] = ["green", "yellow", "red", "inactive"];

  return (
    <div className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h3 className="text-sm font-semibold mb-3">Salud del portfolio</h3>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">Sin cuentas activas.</p>
      ) : (
        <>
          <div className="flex h-2 w-full overflow-hidden rounded-full">
            {order.map((b) => {
              const pct = (distribution[b] / total) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={b}
                  className={cn("h-full", BUCKET_CONFIG[b].barClass)}
                  style={{ width: `${pct}%` }}
                  aria-label={`${BUCKET_CONFIG[b].label}: ${distribution[b]}`}
                />
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {order.map((b) => (
              <div
                key={b}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-xs",
                  BUCKET_CONFIG[b].pillClass
                )}
              >
                <span>{BUCKET_CONFIG[b].label}</span>
                <span className="font-semibold tabular-nums">
                  {distribution[b]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
