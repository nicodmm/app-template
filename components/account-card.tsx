import Link from "next/link";
import { CircleCheck, AlertTriangle, AlertOctagon, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountWithOwner } from "@/lib/queries/accounts";

const HEALTH_CONFIG = {
  green: {
    label: "Al día",
    className:
      "bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white ring-1 ring-emerald-700/50 shadow-sm shadow-emerald-500/20",
    Icon: CircleCheck,
  },
  yellow: {
    label: "Atención",
    className:
      "bg-amber-500 text-white dark:bg-amber-500 dark:text-amber-950 ring-1 ring-amber-700/50 shadow-sm shadow-amber-500/25",
    Icon: AlertTriangle,
  },
  red: {
    label: "En riesgo",
    className:
      "bg-red-600 text-white dark:bg-red-600 dark:text-white ring-1 ring-red-800/50 shadow-sm shadow-red-500/25",
    Icon: AlertOctagon,
  },
  inactive: {
    label: "Sin actividad",
    className:
      "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700",
    Icon: MinusCircle,
  },
} as const;

function relativeTime(date: Date | string | null): string {
  if (!date) return "Sin actividad";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem.`;
  if (days < 365) return `Hace ${Math.floor(days / 30)} mes.`;
  return `Hace ${Math.floor(days / 365)} año`;
}

interface AccountCardProps {
  account: AccountWithOwner;
}

export function AccountCard({ account }: AccountCardProps) {
  const signal = (account.healthSignal ?? "inactive") as keyof typeof HEALTH_CONFIG;
  const config = HEALTH_CONFIG[signal] ?? HEALTH_CONFIG.inactive;
  const Icon = config.Icon;

  const daysSinceActivity = account.lastActivityAt
    ? Math.floor(
        (Date.now() - new Date(account.lastActivityAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <Link
      href={`/app/accounts/${account.id}`}
      className={cn(
        "group block rounded-xl p-5 backdrop-blur-[14px] transition-all",
        "[background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]",
        "hover:[background:var(--glass-bg-strong)] hover:translate-y-[-1px] hover:[box-shadow:0_14px_44px_-14px_rgba(15,18,53,0.22)]"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {account.name}
        </h3>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            config.className
          )}
        >
          <Icon size={11} aria-hidden />
          {config.label}
        </span>
      </div>

      {account.healthJustification && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {account.healthJustification}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {account.ownerName ?? account.ownerEmail ?? "Sin responsable"}
        </span>
        <span>
          {daysSinceActivity !== null && daysSinceActivity > 30 ? (
            <span className="text-amber-700 dark:text-amber-300 font-medium">
              Sin actividad {daysSinceActivity}d
            </span>
          ) : (
            relativeTime(account.lastActivityAt)
          )}
        </span>
      </div>
    </Link>
  );
}
