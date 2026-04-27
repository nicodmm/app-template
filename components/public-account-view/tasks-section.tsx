"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Quote,
  Info,
  Check,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

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

type Tab = "pending" | "completed";

function buildGroups(tasks: PublicTask[]): Group[] {
  const map = new Map<string, Group>();
  for (const t of tasks) {
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
  return [...map.values()].sort((a, b) => {
    if (a.key === "__manual__") return 1;
    if (b.key === "__manual__") return -1;
    return b.dateKey.localeCompare(a.dateKey);
  });
}

export function TasksSection({ rows }: Props) {
  const [tab, setTab] = useState<Tab>("pending");

  const pending = useMemo(
    () =>
      rows.filter(
        (t) => t.status === "pending" || t.status === "in_progress"
      ),
    [rows]
  );
  const completed = useMemo(
    () =>
      [...rows.filter((t) => t.status === "completed")].sort(
        (a, b) =>
          (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
      ),
    [rows]
  );

  if (rows.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-3">Tareas</h2>
        <p className="text-sm text-muted-foreground">
          Tu equipo está al día — no hay tareas registradas todavía.
        </p>
      </GlassCard>
    );
  }

  const visible = tab === "pending" ? pending : completed;
  const groups = buildGroups(visible);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-semibold">Tareas</h2>
        <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
          {(
            [
              { k: "pending", label: "En curso", count: pending.length },
              { k: "completed", label: "Completadas", count: completed.length },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t.k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  tab === t.k
                    ? "bg-primary/10 text-primary"
                    : "bg-muted-foreground/10"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          {tab === "pending"
            ? "No hay tareas en curso ahora mismo."
            : "Todavía no hay tareas completadas."}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <TaskGroup key={g.key} group={g} defaultOpen={true} />
          ))}
        </div>
      )}
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
  const isCompleted = task.status === "completed";
  return (
    <div className="py-2.5">
      <div className="flex items-start gap-3">
        {isCompleted ? (
          <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-emerald-500 border border-emerald-500 text-white flex items-center justify-center">
            <Check size={11} strokeWidth={3} />
          </div>
        ) : (
          <div className="mt-1 shrink-0 w-3.5 h-3.5 rounded-full border border-muted-foreground/40" />
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
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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
                Completada el{" "}
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
