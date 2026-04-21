"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { HealthHistoryEntry } from "@/lib/queries/signals";

type SignalConfig = {
  label: string;
  dotClass: string;
  pillClass: string;
};

const SIGNAL_CONFIG: Record<string, SignalConfig> = {
  green: {
    label: "Saludable",
    dotClass: "bg-emerald-500 border-emerald-500",
    pillClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  yellow: {
    label: "Requiere Atención",
    dotClass: "bg-amber-400 border-amber-400",
    pillClass: "bg-amber-200 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
  },
  red: {
    label: "Crítico",
    dotClass: "bg-red-500 border-red-500",
    pillClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  inactive: {
    label: "Inactivo",
    dotClass: "bg-muted-foreground border-muted-foreground",
    pillClass: "bg-muted text-muted-foreground",
  },
};

function getConfig(signal: string): SignalConfig {
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

  const visible = showAll ? withChangeFlag : withChangeFlag.filter((x) => x.isChange);
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
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        <ul className="space-y-4">
          {visible.map(({ entry, isChange }) => (
            <TimelineItem key={entry.id} entry={entry} isChange={isChange} />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface TimelineItemProps {
  entry: HealthHistoryEntry;
  isChange: boolean;
}

function TimelineItem({ entry, isChange }: TimelineItemProps) {
  const [open, setOpen] = useState(false);
  const config = getConfig(entry.healthSignal);
  const displayDate = entry.meetingDate ? formatDate(entry.meetingDate) : formatDate(entry.createdAt);

  return (
    <li className="relative pl-6">
      {/* Dot */}
      <span
        className={`absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-2 ${
          isChange ? config.dotClass : "bg-background " + config.dotClass.replace("bg-", "border-").split(" ")[0]
        }`}
      />

      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.pillClass}`}>
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
              <p className="text-xs text-muted-foreground leading-relaxed rounded-md bg-muted/40 p-2 mt-1">
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
