"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Quote,
  Info,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

interface PublicTask {
  id: string;
  description: string;
  priority: number;
  transcriptId: string | null;
  meetingDate: Date | null;
  meetingTitle: string | null;
  sourceExcerpt: string | null;
  sourceContext: string | null;
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

function formatDate(d: Date | null): string {
  if (!d) return "Sin fecha";
  return new Date(d).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Group {
  key: string;
  label: string;
  dateKey: string;
  tasks: PublicTask[];
}

export function TasksSection({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-3">Tareas en curso</h2>
        <p className="text-sm text-muted-foreground">
          Tu equipo está al día — no hay tareas pendientes ahora mismo.
        </p>
      </GlassCard>
    );
  }

  // Group by transcript so the layout matches the agency-side view.
  const map = new Map<string, Group>();
  for (const t of rows) {
    const key = t.transcriptId ?? "__manual__";
    if (!map.has(key)) {
      const label =
        key === "__manual__"
          ? "Coordinación con tu equipo"
          : `Reunión ${formatDate(t.meetingDate)}`;
      const dateKey = (t.meetingDate ?? t.createdAt).toISOString().slice(0, 10);
      map.set(key, { key, label, dateKey, tasks: [] });
    }
    map.get(key)!.tasks.push(t);
  }
  const groups = [...map.values()].sort((a, b) => {
    if (a.key === "__manual__") return 1;
    if (b.key === "__manual__") return -1;
    return b.dateKey.localeCompare(a.dateKey);
  });

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Tareas en curso</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} pendiente{rows.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <TaskGroup key={g.key} group={g} defaultOpen={true} />
        ))}
      </div>
    </GlassCard>
  );
}

function TaskGroup({
  group,
  defaultOpen,
}: {
  group: Group;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <CalendarDays size={11} />
        <span>{group.label}</span>
        <span className="ml-auto text-muted-foreground/60">
          {group.tasks.length} tarea{group.tasks.length !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 divide-y divide-[var(--glass-tile-border)]">
          {group.tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: PublicTask }) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_LABEL[task.priority] ?? "Media";
  const priorityCls = PRIORITY_CLS[task.priority] ?? PRIORITY_CLS[3];
  const hasContext = task.sourceExcerpt || task.sourceContext;
  return (
    <div className="py-2.5">
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0 w-3.5 h-3.5 rounded-full border border-muted-foreground/40" />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => hasContext && setExpanded((v) => !v)}
            className={cn(
              "text-sm leading-snug text-left w-full",
              hasContext && "hover:text-primary transition-colors cursor-pointer"
            )}
          >
            {task.description}
          </button>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                priorityCls
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
          </div>
        </div>
      </div>
      {expanded && hasContext && (
        <div className="mt-2 ml-7 rounded-md p-2.5 [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] text-xs space-y-2">
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
