"use client";

import Link from "next/link";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  TrendingUp,
  ArrowUpCircle,
  Moon,
  Sparkles,
  CheckCircle2,
  Trash2,
  RotateCcw,
  CalendarDays,
  Bell,
} from "lucide-react";
import { resolveSignal, reopenSignal, deleteSignal } from "@/app/actions/signals";
import type { SignalWithContext } from "@/lib/queries/signals";
import type { LucideIcon } from "lucide-react";

type TypeConfig = {
  label: string;
  icon: LucideIcon;
  className: string;
  iconClassName: string;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  churn_risk: {
    label: "Riesgo de Churn",
    icon: AlertTriangle,
    className:
      "bg-red-600 text-white dark:bg-red-600 ring-1 ring-red-800/50 shadow-sm shadow-red-500/25",
    iconClassName: "text-red-600 dark:text-red-400",
  },
  growth_opportunity: {
    label: "Oportunidad de Crecimiento",
    icon: TrendingUp,
    className:
      "bg-emerald-500 text-white dark:bg-emerald-600 ring-1 ring-emerald-700/50 shadow-sm shadow-emerald-500/20",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
  upsell_opportunity: {
    label: "Oportunidad de Upsell",
    icon: ArrowUpCircle,
    className:
      "bg-blue-600 text-white dark:bg-blue-600 ring-1 ring-blue-800/50 shadow-sm shadow-blue-500/25",
    iconClassName: "text-blue-600 dark:text-blue-400",
  },
  inactivity_flag: {
    label: "Inactividad",
    icon: Moon,
    className:
      "bg-amber-500 text-white dark:bg-amber-500 dark:text-amber-950 ring-1 ring-amber-700/50 shadow-sm shadow-amber-500/25",
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
  custom: {
    label: "Personalizada",
    icon: Sparkles,
    className:
      "bg-purple-600 text-white dark:bg-purple-600 ring-1 ring-purple-800/50 shadow-sm shadow-purple-500/25",
    iconClassName: "text-purple-600 dark:text-purple-400",
  },
};

function getTypeConfig(type: string): TypeConfig {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.custom;
}

function formatMeetingDate(meetingDate: string | null, createdAt: Date | string): string {
  const d = meetingDate
    ? new Date(meetingDate + "T12:00:00")
    : new Date(createdAt);
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

// ── Signal row ─────────────────────────────────────────────────────────────────

interface SignalRowProps {
  signal: SignalWithContext;
  accountId: string;
}

function SignalRow({ signal, accountId }: SignalRowProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const config = getTypeConfig(signal.type);
  const Icon = config.icon;
  const isResolved = signal.status === "resolved";

  function resolve() {
    startTransition(async () => {
      await resolveSignal(signal.id, accountId);
      router.refresh();
    });
  }

  function reopen() {
    startTransition(async () => {
      await reopenSignal(signal.id, accountId);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("¿Eliminar esta señal?")) return;
    startTransition(async () => {
      await deleteSignal(signal.id, accountId);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex items-start gap-3 p-3 group transition-opacity ${
        isPending ? "opacity-50" : ""
      } ${isResolved ? "bg-muted/20" : ""}`}
    >
      <div className={`shrink-0 mt-0.5 ${config.iconClassName}`}>
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
          >
            {config.label}
          </span>
          {isResolved && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={11} /> Resuelta
              {signal.resolvedByName && ` por ${signal.resolvedByName}`}
            </span>
          )}
        </div>

        <p
          className={`text-sm leading-snug mt-1.5 ${
            isResolved ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {signal.description}
        </p>

        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground/80">
          <CalendarDays size={11} />
          {formatMeetingDate(signal.meetingDate, signal.createdAt)}
          {signal.transcriptFileName && (
            <span className="text-muted-foreground/60 truncate">· {signal.transcriptFileName}</span>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isResolved ? (
          <button
            onClick={reopen}
            disabled={isPending}
            title="Reabrir"
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        ) : (
          <button
            onClick={resolve}
            disabled={isPending}
            title="Marcar como resuelta"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 px-2 py-1 text-xs font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
          >
            <CheckCircle2 size={11} /> Resolver
          </button>
        )}
        <button
          onClick={remove}
          disabled={isPending}
          title="Eliminar"
          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface SignalsPanelProps {
  signals: SignalWithContext[];
  accountId: string;
  hasAgencyContext: boolean;
}

type Tab = "active" | "resolved";

export function SignalsPanel({
  signals,
  accountId,
  hasAgencyContext,
}: SignalsPanelProps) {
  const [tab, setTab] = useState<Tab>("active");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const activeCount = signals.filter((s) => s.status === "active").length;
  const resolvedCount = signals.filter((s) => s.status === "resolved").length;

  const filtered = useMemo(() => {
    return signals
      .filter((s) => (tab === "active" ? s.status === "active" : s.status === "resolved"))
      .filter((s) => typeFilter === "all" || s.type === typeFilter);
  }, [signals, tab, typeFilter]);

  const banner = !hasAgencyContext && (
    <div className="rounded-lg [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)] px-3 py-2.5 flex items-start gap-2">
      <Bell size={14} className="text-primary mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 text-xs leading-relaxed">
        <span className="font-medium">Las señales pueden ser más precisas.</span>{" "}
        <span className="text-muted-foreground">
          Configurá el contexto de tu agencia (servicios, ICP, señales que te
          interesan detectar) para que la IA priorice mejor.
        </span>{" "}
        <Link
          href="/app/settings/workspace"
          className="text-primary hover:underline underline-offset-2 font-medium"
        >
          Configurar →
        </Link>
      </div>
    </div>
  );

  if (signals.length === 0) {
    return (
      <div className="space-y-3">
        {banner}
        <p className="text-sm text-muted-foreground py-2">
          No hay señales detectadas todavía. Se generan automáticamente al procesar transcripciones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {banner}
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(
          [
            { k: "active", label: "Activas", count: activeCount },
            { k: "resolved", label: "Resueltas", count: resolvedCount },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.k
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                tab === t.k ? "bg-primary/10 text-primary" : "bg-muted-foreground/10"
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">Todos los tipos</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground ml-1">
          {filtered.length} {tab === "active" ? "activa" : "resuelta"}
          {filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          {tab === "active"
            ? "No hay señales activas con ese filtro."
            : "No hay señales resueltas con ese filtro."}
        </p>
      ) : (
        <div className="rounded-lg [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)] divide-y divide-[var(--glass-tile-border)]">
          {filtered.map((s) => (
            <SignalRow key={s.id} signal={s} accountId={accountId} />
          ))}
        </div>
      )}
    </div>
  );
}
