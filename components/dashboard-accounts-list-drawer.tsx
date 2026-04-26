"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { X, ChevronRight } from "lucide-react";
import { fetchDashboardAccountsList } from "@/app/actions/dashboard";
import type {
  AccountsListFilter,
  AccountsListRow,
  DashboardPeriod,
  HealthBucket,
} from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";

const HEALTH_PILL: Record<HealthBucket, { label: string; cls: string }> = {
  green: {
    label: "Al día",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  yellow: {
    label: "Atención",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  red: {
    label: "En riesgo",
    cls: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  inactive: {
    label: "Sin actividad",
    cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  },
};

interface DashboardAccountsListDrawerProps {
  filter: AccountsListFilter | null;
  title: string | null;
  period: DashboardPeriod;
  service: string | null;
  ownerId: string | null;
  onClose: () => void;
}

export function DashboardAccountsListDrawer({
  filter,
  title,
  period,
  service,
  ownerId,
  onClose,
}: DashboardAccountsListDrawerProps) {
  const [rows, setRows] = useState<AccountsListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!filter) {
      setRows(null);
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await fetchDashboardAccountsList(
          filter,
          period,
          service,
          ownerId
        );
        setRows(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    });
  }, [filter, period, service, ownerId]);

  useEffect(() => {
    if (!filter) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filter, onClose]);

  if (!filter) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Cuentas — ${title ?? ""}`}
        className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col [background:var(--glass-bg)] backdrop-blur-[18px] [border-left:1px_solid_var(--glass-border)] [box-shadow:-12px_0_32px_-12px_rgba(0,0,0,0.18)]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 [border-bottom:1px_solid_var(--glass-border)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cuentas
            </p>
            <h2 className="text-base font-semibold">{title ?? ""}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-accent transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">
          {isPending && (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          )}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {rows && !isPending && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay cuentas en este segmento.
            </p>
          )}
          {rows && !isPending && !error && rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md px-3 py-2.5 text-sm [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
                >
                  <Link
                    href={`/app/accounts/${r.id}`}
                    className="group flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium group-hover:text-primary transition-colors truncate">
                          {r.name}
                        </span>
                        {r.healthSignal && filter.type !== "health" && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              HEALTH_PILL[r.healthSignal].cls
                            )}
                          >
                            {HEALTH_PILL[r.healthSignal].label}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          {r.serviceScope
                            ? r.serviceScope
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .join(" · ")
                            : "Sin servicio"}
                        </span>
                        <span>{r.ownerName ?? "Sin responsable"}</span>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="shrink-0 mt-1 text-muted-foreground group-hover:text-primary transition-colors"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
