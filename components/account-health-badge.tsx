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
      "bg-emerald-500 text-white dark:bg-emerald-600 ring-1 ring-emerald-700/50 shadow-sm shadow-emerald-500/20",
    Icon: CircleCheck,
  },
  yellow: {
    label: "Requiere atención",
    className:
      "bg-amber-500 text-white dark:bg-amber-500 dark:text-amber-950 ring-1 ring-amber-700/50 shadow-sm shadow-amber-500/25",
    Icon: AlertTriangle,
  },
  red: {
    label: "En riesgo",
    className:
      "bg-red-600 text-white ring-1 ring-red-800/50 shadow-sm shadow-red-500/25",
    Icon: AlertOctagon,
  },
  inactive: {
    label: "Sin actividad",
    className:
      "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700",
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
