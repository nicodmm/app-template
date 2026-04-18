"use client";

import { useMemo, useState } from "react";
import type { ChangeEventRow } from "@/lib/queries/paid-media";

interface Props {
  events: ChangeEventRow[];
  totalAvailable: number; // used to show/hide "Ver más"
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

const ENTITY_ICON: Record<string, string> = {
  campaign: "📊",
  ad_set: "🎯",
  ad: "▶️",
};

const LEVEL_LABELS = [
  { value: "all", label: "Todas" },
  { value: "campaign", label: "Campañas" },
  { value: "ad_set", label: "Ad Sets" },
  { value: "ad", label: "Anuncios" },
] as const;

function timeAgo(d: Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} días`;
}

function describeEvent(event: ChangeEventRow): string {
  const data = event.eventData;
  const oldV = (data.old_value as string | undefined) ?? null;
  const newV = (data.new_value as string | undefined) ?? null;
  switch (event.eventType) {
    case "campaign_created": return "campaña creada";
    case "campaign_deleted": return "campaña eliminada";
    case "campaign_status_change": return `estado: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "campaign_budget_change": return `presupuesto: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "campaign_name_change": return `nombre cambiado`;
    case "campaign_schedule_change": return "fechas modificadas";
    case "campaign_objective_change": return `objetivo: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_set_created": return "conjunto creado";
    case "ad_set_deleted": return "conjunto eliminado";
    case "ad_set_targeting_change": return "segmentación modificada";
    case "ad_set_budget_change": return `presupuesto: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_set_status_change": return `estado: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_created": return "anuncio creado";
    case "ad_deleted": return "anuncio eliminado";
    case "ad_status_change": return `estado: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_run_status_change": return `ejecución: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_creative_change": return "creatividad modificada";
    default: return event.eventType;
  }
}

export function PaidMediaChangeTimeline({ events, totalAvailable, onLoadMore, loadingMore }: Props) {
  const [level, setLevel] = useState<"all" | "campaign" | "ad_set" | "ad">("all");

  const filtered = useMemo(
    () => (level === "all" ? events : events.filter((e) => e.entityType === level)),
    [events, level]
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        {LEVEL_LABELS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => setLevel(l.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              level === l.value
                ? "border border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          Sin cambios registrados en el período.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((e) => (
            <li key={e.id} className="p-3 text-sm flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">{ENTITY_ICON[e.entityType] ?? "•"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium truncate">{e.entityName ?? e.entityMetaId}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(e.occurredAt)}</span>
                </div>
                <div className="text-sm text-muted-foreground">{describeEvent(e)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {events.length < totalAvailable && onLoadMore && (
        <div className="border-t border-border p-3 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-md px-3 py-1 text-xs font-medium text-primary hover:bg-accent disabled:opacity-50"
          >
            {loadingMore ? "Cargando…" : "Ver más"}
          </button>
        </div>
      )}
    </div>
  );
}
