"use client";

import { useState, useMemo } from "react";
import { Mail, Search, Briefcase, CalendarDays, MessageCircle } from "lucide-react";
import type { ParticipantWithContext } from "@/lib/queries/participants";

const CONFIDENCE_CONFIG: Record<string, { label: string; className: string }> = {
  high: {
    label: "Alta",
    className:
      "bg-emerald-500 text-white dark:bg-emerald-600 ring-1 ring-emerald-700/50 shadow-sm shadow-emerald-500/20",
  },
  medium: {
    label: "Media",
    className:
      "bg-amber-500 text-white dark:bg-amber-500 dark:text-amber-950 ring-1 ring-amber-700/50 shadow-sm shadow-amber-500/25",
  },
  low: {
    label: "Baja",
    className:
      "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700",
  },
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date + (date.length === 10 ? "T12:00:00" : "")) : new Date(date);
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(date: Date | string | null): string {
  if (!date) return "";
  const d =
    typeof date === "string"
      ? new Date(date + (date.length === 10 ? "T12:00:00" : ""))
      : date;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months !== 1 ? "es" : ""}`;
  const years = Math.floor(days / 365);
  return `hace ${years} año${years !== 1 ? "s" : ""}`;
}

interface ParticipantsPanelProps {
  participants: ParticipantWithContext[];
}

export function ParticipantsPanel({ participants }: ParticipantsPanelProps) {
  const [search, setSearch] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participants.filter((p) => {
      if (confidenceFilter !== "all" && p.confidence !== confidenceFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false) ||
        (p.role?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [participants, search, confidenceFilter]);

  if (participants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Todavía no hay participantes identificados. Se extraen automáticamente al procesar transcripciones.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email o rol..."
            className="w-full rounded-md border border-input bg-background pl-7 pr-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={confidenceFilter}
          onChange={(e) => setConfidenceFilter(e.target.value as typeof confidenceFilter)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">Toda la confianza</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>
        <p className="text-xs text-muted-foreground ml-auto">
          {filtered.length} de {participants.length}
        </p>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Sin resultados.</p>
      ) : (
        <div className="rounded-lg [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)] divide-y divide-[var(--glass-tile-border)]">
          {filtered.map((p) => {
            const confidence = CONFIDENCE_CONFIG[p.confidence] ?? CONFIDENCE_CONFIG.medium;
            return (
              <div key={p.id} className="flex items-start gap-3 p-3">
                {/* Avatar */}
                <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {getInitials(p.name)}
                </div>

                {/* Main */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${confidence.className}`}
                    >
                      {confidence.label}
                    </span>
                  </div>

                  {/* Contact info row */}
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {p.role && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Briefcase size={11} />
                        {p.role}
                      </span>
                    )}
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors truncate"
                      >
                        <Mail size={11} />
                        {p.email}
                      </a>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground/80">
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={11} />
                      {p.appearanceCount} reunión{p.appearanceCount !== 1 ? "es" : ""}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={11} />
                      Última {timeAgo(p.lastMeetingDate ?? p.lastSeenAt)}
                      {p.lastMeetingDate && ` · ${formatDate(p.lastMeetingDate)}`}
                    </span>
                    {p.appearanceCount > 1 && p.firstMeetingDate && (
                      <span className="text-muted-foreground/60">
                        desde {formatDate(p.firstMeetingDate)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
