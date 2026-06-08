"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Quote, Info, Check } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import {
  TAREA_COLUMNS,
  normalizeColumn,
  type TareaColumnKey,
} from "@/lib/tareas/columns";

interface PublicTask {
  id: string;
  description: string;
  priority: number;
  status: string;
  transcriptId: string | null;
  meetingDate: Date | null;
  meetingTitle: string | null;
  sourceExcerpt: string | null;
  sourceContext: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

interface Props {
  rows: PublicTask[];
}

const PRIORITY_LABEL: Record<number, string> = {
  1: "Crítica",
  2: "Alta",
  3: "Media",
  4: "Baja",
  5: "Mínima",
};

const PRIORITY_CLS: Record<number, string> = {
  1: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  2: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  3: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  4: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  5: "bg-muted text-muted-foreground",
};

export function TasksSection({ rows }: Props) {
  // Agrupa por columna (etapa) usando la normalización de lectura.
  const byColumn = useMemo(() => {
    const map = {} as Record<TareaColumnKey, PublicTask[]>;
    for (const c of TAREA_COLUMNS) map[c.key] = [];
    for (const t of rows) map[normalizeColumn(t.status)].push(t);
    return map;
  }, [rows]);

  // Solo columnas con al menos una tarea pública.
  const visibleColumns = TAREA_COLUMNS.filter((c) => byColumn[c.key].length > 0);

  if (rows.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-3">Tareas</h2>
        <p className="text-sm text-muted-foreground">
          Tu equipo está al día — no hay tareas para mostrar todavía.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-4">Tareas</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {visibleColumns.map((c) => (
          <div key={c.key} className="w-64 shrink-0">
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className="text-xs font-semibold text-foreground">
                {c.label}
              </span>
              <span className="inline-flex items-center rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {byColumn[c.key].length}
              </span>
            </div>
            <div className="space-y-2">
              {byColumn[c.key].map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function TaskCard({ task }: { task: PublicTask }) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_LABEL[task.priority] ?? "Media";
  const priorityCls = PRIORITY_CLS[task.priority] ?? PRIORITY_CLS[3];
  const hasContext = Boolean(task.sourceExcerpt || task.sourceContext);
  const isCompleted = task.status === "completed" || task.status === "listas";

  return (
    <div className="rounded-lg p-2.5 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
      <div className="flex items-start gap-2">
        {isCompleted ? (
          <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-emerald-500 border border-emerald-500 text-white flex items-center justify-center">
            <Check size={11} strokeWidth={3} />
          </div>
        ) : (
          <div className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full border border-muted-foreground/40" />
        )}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => hasContext && setExpanded((v) => !v)}
            className={cn(
              "text-sm leading-snug text-left w-full",
              isCompleted && "line-through text-muted-foreground",
              hasContext && "hover:text-primary transition-colors cursor-pointer"
            )}
          >
            {task.description}
          </button>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                priorityCls,
                isCompleted && "opacity-60"
              )}
            >
              {priority}
            </span>
            {task.meetingTitle && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <CalendarDays size={9} />
                {task.meetingTitle}
              </span>
            )}
            {isCompleted && task.completedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                <Check size={9} />
                {new Date(task.completedAt).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>
        </div>
      </div>
      {expanded && hasContext && (
        <div className="mt-2 rounded-md p-2.5 [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] text-xs space-y-2">
          {task.sourceExcerpt && (
            <div className="flex gap-2">
              <Quote
                size={11}
                className="shrink-0 mt-0.5 text-primary/70"
                aria-hidden
              />
              <p className="italic text-foreground leading-relaxed">
                «{task.sourceExcerpt}»
              </p>
            </div>
          )}
          {task.sourceContext && (
            <div className="flex gap-2">
              <Info
                size={11}
                className="shrink-0 mt-0.5 text-muted-foreground"
                aria-hidden
              />
              <p className="text-muted-foreground leading-relaxed">
                {task.sourceContext}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
