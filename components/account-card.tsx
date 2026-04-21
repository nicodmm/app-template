import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AccountWithOwner } from "@/lib/queries/accounts";

const HEALTH_CONFIG = {
  green: {
    label: "Al día",
    className: "bg-success/15 text-success border-success/20",
    dot: "bg-success",
  },
  yellow: {
    label: "Atención",
    className: "bg-warning/15 text-warning-foreground border-warning/20",
    dot: "bg-warning",
  },
  red: {
    label: "En riesgo",
    className: "bg-destructive/15 text-destructive border-destructive/20",
    dot: "bg-destructive",
  },
  inactive: {
    label: "Sin actividad",
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
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

  const daysSinceActivity = account.lastActivityAt
    ? Math.floor((Date.now() - new Date(account.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Link
      href={`/app/accounts/${account.id}`}
      className="group block rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {account.name}
        </h3>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            config.className
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
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
            <span className="text-warning-foreground font-medium">
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
