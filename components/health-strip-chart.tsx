"use client";

import { cn } from "@/lib/utils";
import type { WeeklyHealthBucket } from "@/lib/queries/signals";

const SIGNAL_FILL: Record<NonNullable<WeeklyHealthBucket["signal"]>, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  inactive: "bg-muted-foreground/40",
};

const SIGNAL_LABEL: Record<NonNullable<WeeklyHealthBucket["signal"]>, string> = {
  green: "Saludable",
  yellow: "Atención",
  red: "Crítico",
  inactive: "Inactivo",
};

function formatWeekLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

interface HealthStripChartProps {
  buckets: WeeklyHealthBucket[];
  /** Optional anchor id to scroll to when the strip is clicked. */
  scrollTo?: string;
  className?: string;
}

/**
 * Compact 12-cell weekly health sparkline. Each cell = one week's dominant
 * signal (carry-forward when the week had no new entry). Dimmed cells mean
 * carry-forward; full opacity means a real change/entry that week.
 *
 * Color is paired with a tooltip+label (a11y: not color-only).
 */
export function HealthStripChart({
  buckets,
  scrollTo,
  className,
}: HealthStripChartProps) {
  function handleClick() {
    if (!scrollTo) return;
    const el = document.getElementById(scrollTo);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const Wrapper = scrollTo ? "button" : "div";

  return (
    <Wrapper
      type={scrollTo ? "button" : undefined}
      onClick={scrollTo ? handleClick : undefined}
      aria-label={
        scrollTo
          ? "Ver evolución de salud completa"
          : "Evolución de salud — últimas 12 semanas"
      }
      className={cn(
        "flex items-center gap-1 rounded-md p-1",
        scrollTo &&
          "transition-colors hover:bg-white/40 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {buckets.map((b) => {
        const fill = b.signal ? SIGNAL_FILL[b.signal] : "bg-muted/40";
        const label = b.signal ? SIGNAL_LABEL[b.signal] : "Sin datos";
        const dim = b.carryForward ? "opacity-60" : "opacity-100";
        return (
          <span
            key={b.weekStart}
            title={`${formatWeekLabel(b.weekStart)} — ${label}${
              b.carryForward ? " (sin cambio)" : ""
            }`}
            aria-label={`Semana del ${formatWeekLabel(b.weekStart)}: ${label}`}
            className={cn(
              "h-4 w-3 rounded-[3px]",
              fill,
              dim,
              "ring-1 ring-white/40 dark:ring-white/10"
            )}
          />
        );
      })}
    </Wrapper>
  );
}
