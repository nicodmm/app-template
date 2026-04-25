"use client";

import { useState } from "react";
import {
  CircleCheck,
  AlertTriangle,
  AlertOctagon,
  MinusCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthHistoryEntry } from "@/lib/queries/signals";

type IconComponent = typeof CircleCheck;

const SIGNAL_CONFIG: Record<
  string,
  { label: string; pillClass: string; ringClass: string; Icon: IconComponent }
> = {
  green: {
    label: "Saludable",
    pillClass:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    ringClass: "border-emerald-500 bg-emerald-500/15",
    Icon: CircleCheck,
  },
  yellow: {
    label: "Atención",
    pillClass:
      "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    ringClass: "border-amber-500 bg-amber-500/15",
    Icon: AlertTriangle,
  },
  red: {
    label: "Crítico",
    pillClass:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    ringClass: "border-red-500 bg-red-500/15",
    Icon: AlertOctagon,
  },
  inactive: {
    label: "Inactivo",
    pillClass: "bg-muted text-muted-foreground",
    ringClass: "border-muted-foreground bg-muted",
    Icon: MinusCircle,
  },
};

function getConfig(signal: string) {
  return SIGNAL_CONFIG[signal] ?? SIGNAL_CONFIG.inactive;
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface HealthHistoryTimelineProps {
  entries: HealthHistoryEntry[];
}

export function HealthHistoryTimeline({ entries }: HealthHistoryTimelineProps) {
  const [showAll, setShowAll] = useState(false);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No hay historial de salud todavía. Se registra al procesar transcripciones.
      </p>
    );
  }

  // Mark entries where the signal CHANGED from the previous (older) one.
  // Entries are sorted newest first, so compare with next (older) entry.
  const withChangeFlag = entries.map((e, i) => {
    const older = entries[i + 1];
    const isChange = !older || older.healthSignal !== e.healthSignal;
    return { entry: e, isChange };
  });

  const visible = showAll
    ? withChangeFlag
    : withChangeFlag.filter((x) => x.isChange);
  const hiddenCount = withChangeFlag.length - visible.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {showAll
            ? `Mostrando ${entries.length} registro${entries.length !== 1 ? "s" : ""}`
            : `${visible.length} cambio${visible.length !== 1 ? "s" : ""} de estado`}
        </p>
        {hiddenCount > 0 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="text-xs text-primary hover:underline underline-offset-2"
          >
            Ver todos los registros ({entries.length})
          </button>
        )}
        {showAll && (
          <button
            onClick={() => setShowAll(false)}
            className="text-xs text-primary hover:underline underline-offset-2"
          >
            Mostrar solo cambios
          </button>
        )}
      </div>

      <div className="relative">
        <div className="absolute left-[10px] top-3 bottom-3 w-px bg-[var(--glass-border)]" />

        <ul className="space-y-5">
          {visible.map(({ entry, isChange }) => (
            <TimelineItem key={entry.id} entry={entry} isChange={isChange} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function TimelineItem({
  entry,
  isChange,
}: {
  entry: HealthHistoryEntry;
  isChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const config = getConfig(entry.healthSignal);
  const Icon = config.Icon;
  const displayDate = entry.meetingDate
    ? formatDate(entry.meetingDate)
    : formatDate(entry.createdAt);

  return (
    <li className="relative pl-8">
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0.5 flex h-[21px] w-[21px] items-center justify-center rounded-full border-2",
          config.ringClass,
          !isChange && "opacity-60"
        )}
      >
        <Icon size={11} className="text-foreground/80" />
      </span>

      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              config.pillClass
            )}
          >
            {config.label}
          </span>
          <span className="text-xs text-muted-foreground">{displayDate}</span>
          {!isChange && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
              sin cambio
            </span>
          )}
        </div>

        {entry.justification && (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {open ? "Ocultar justificación" : "Ver justificación"}
            </button>
            {open && (
              <p className="text-xs text-muted-foreground leading-relaxed rounded-md bg-white/40 dark:bg-white/5 p-2 mt-1 [border:1px_solid_var(--glass-border)]">
                {entry.justification}
              </p>
            )}
          </>
        )}

        {entry.transcriptFileName && (
          <p className="text-[11px] text-muted-foreground/60 truncate">
            {entry.transcriptFileName}
          </p>
        )}
      </div>
    </li>
  );
}
