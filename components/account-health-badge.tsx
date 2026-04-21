import { cn } from "@/lib/utils";

const SIGNAL_CONFIG = {
  green: { label: "En buen estado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  yellow: { label: "Requiere atención", className: "bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-200" },
  red: { label: "En riesgo", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  inactive: { label: "Sin actividad", className: "bg-muted text-muted-foreground" },
} as const;

type HealthSignal = keyof typeof SIGNAL_CONFIG;

interface AccountHealthBadgeProps {
  signal: string | null;
  className?: string;
}

export function AccountHealthBadge({ signal, className }: AccountHealthBadgeProps) {
  const key = (signal ?? "inactive") as HealthSignal;
  const config = SIGNAL_CONFIG[key] ?? SIGNAL_CONFIG.inactive;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
