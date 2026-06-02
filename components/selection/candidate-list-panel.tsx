"use client";

import { useState } from "react";
import { Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import type { SelectionCandidate } from "@/lib/drizzle/schema";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  advance: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  offer: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  advance: "Avanza",
  offer: "Oferta",
  rejected: "Descartado",
};

interface Props {
  candidates: SelectionCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CandidateListPanel({ candidates, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? candidates.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q)
        );
      })
    : candidates;

  return (
    <GlassCard className="flex flex-col overflow-hidden">
      {/* Search input */}
      <div className="p-3 [border-bottom:1px_solid_var(--glass-border)]">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Buscar candidato…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
            <Users size={24} className="text-muted-foreground opacity-40" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {query.trim() ? "Sin resultados para esa búsqueda." : "Sin candidatos aún."}
            </p>
          </div>
        ) : (
          <ul role="listbox" aria-label="Candidatos">
            {filtered.map((candidate) => {
              const isSelected = candidate.id === selectedId;
              const statusStyle =
                STATUS_STYLE[candidate.status] ?? STATUS_STYLE.pending;
              const statusLabel =
                STATUS_LABEL[candidate.status] ?? candidate.status;

              return (
                <li key={candidate.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => onSelect(candidate.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors",
                      "[border-bottom:1px_solid_var(--glass-border)]",
                      isSelected
                        ? "[background:var(--glass-bg-strong)]"
                        : "hover:[background:var(--glass-bg-strong)]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium leading-tight line-clamp-1 flex-1">
                        {candidate.firstName} {candidate.lastName}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          statusStyle
                        )}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {candidate.email && (
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {candidate.email}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}
