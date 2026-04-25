import { CircleCheck, AlertTriangle, AlertOctagon, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type IconComponent = typeof CircleCheck;

const SIGNAL_CONFIG: Record<
  string,
  { label: string; className: string; Icon: IconComponent }
> = {
  green: {
    label: "En buen estado",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 ring-1 ring-emerald-500/20",
    Icon: CircleCheck,
  },
  yellow: {
    label: "Requiere atención",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 ring-1 ring-amber-500/30",
    Icon: AlertTriangle,
  },
  red: {
    label: "En riesgo",
    className:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 ring-1 ring-red-500/30",
    Icon: AlertOctagon,
  },
  inactive: {
    label: "Sin actividad",
    className: "bg-muted text-muted-foreground ring-1 ring-border",
    Icon: MinusCircle,
  },
};

interface AccountHealthBadgeProps {
  signal: string | null;
  className?: string;
}

export function AccountHealthBadge({ signal, className }: AccountHealthBadgeProps) {
  const key = signal ?? "inactive";
  const config = SIGNAL_CONFIG[key] ?? SIGNAL_CONFIG.inactive;
  const Icon = config.Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.className,
        className
      )}
    >
      <Icon size={12} aria-hidden />
      {config.label}
    </span>
  );
}
