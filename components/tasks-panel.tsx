"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, ChevronRight, Bot, User, CalendarDays, UserCircle2, CheckCircle2, Quote, Info } from "lucide-react";
import {
  completeTask,
  reopenTask,
  deleteTask,
  createTask,
  updateTaskAssignee,
  completeTasks,
  deleteTasks,
} from "@/app/actions/tasks";
import type { TaskWithContext } from "@/lib/queries/tasks";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

const PRIORITY_CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: "Crítica", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  2: { label: "Alta", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  3: { label: "Media", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  4: { label: "Baja", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  5: { label: "Mínima", className: "bg-muted text-muted-foreground" },
};

function formatMeetingDate(meetingDate: string | null, createdAt: Date | null): string {
  const d = meetingDate
    ? new Date(meetingDate + "T12:00:00")
    : createdAt
    ? new Date(createdAt)
    : null;
  if (!d) return "Sin fecha";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function taskDateKey(t: TaskWithContext): string {
  if (t.meetingDate) return t.meetingDate;
  if (t.meetingCreatedAt) return new Date(t.meetingCreatedAt).toISOString().slice(0, 10);
  if (t.createdAt) return new Date(t.createdAt).toISOString().slice(0, 10);
  return "";
}

// ── Assignee selector ──────────────────────────────────────────────────────────

interface AssigneeSelectorProps {
  currentId: string | null;
  currentName: string | null;
  members: WorkspaceMemberWithUser[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}

function AssigneeSelector({ currentId, currentName, members, onChange, disabled, compact }: AssigneeSelectorProps) {
  return (
    <select
      value={currentId ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className={`rounded-md border border-input bg-background ${compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1.5 text-xs"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-w-[140px] truncate`}
    >
      <option value="">{currentName ? "Sin asignar" : "Sin asignar"}</option>
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.displayName}
        </option>
      ))}
    </select>
  );
}

// ── New task form ──────────────────────────────────────────────────────────────

interface NewTaskFormProps {
  accountId: string;
  members: WorkspaceMemberWithUser[];
  onDone: () => void;
}

function NewTaskForm({ accountId, members, onDone }: NewTaskFormProps) {
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTask(accountId, description, priority, assigneeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <textarea
        ref={ref}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripción de la tarea..."
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Object.entries(PRIORITY_CONFIG).map(([p, { label }]) => (
            <option key={p} value={p}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={assigneeId ?? ""}
          onChange={(e) => setAssigneeId(e.target.value || null)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Sin asignar</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || !description.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Guardando..." : "Agregar"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

// ── Single task row ────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: TaskWithContext;
  accountId: string;
  members: WorkspaceMemberWithUser[];
  expanded: boolean;
  onToggleExpand: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}

function TaskRow({ task, accountId, members, expanded, onToggleExpand, selected, onToggleSelect }: TaskRowProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG[3];
  const isCompleted = task.status === "completed";

  function toggle() {
    startTransition(async () => {
      if (isCompleted) await reopenTask(task.id, accountId);
      else await completeTask(task.id, accountId);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("¿Eliminar esta tarea?")) return;
    startTransition(async () => {
      await deleteTask(task.id, accountId);
      router.refresh();
    });
  }

  function changeAssignee(id: string | null) {
    startTransition(async () => {
      await updateTaskAssignee(task.id, accountId, id);
      router.refresh();
    });
  }

  const meetingLabel = formatMeetingDate(task.meetingDate, task.meetingCreatedAt);

  return (
    <>
      <div className={`flex items-start gap-3 py-2.5 group transition-opacity ${isPending ? "opacity-50" : ""}`}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1 shrink-0 w-3.5 h-3.5 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          aria-label="Seleccionar tarea"
        />

        <button
          onClick={toggle}
          disabled={isPending}
          className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            isCompleted ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground hover:border-primary"
          }`}
        >
          {isCompleted && (
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <button
            onClick={onToggleExpand}
            className={`text-sm leading-snug text-left hover:text-primary transition-colors ${
              isCompleted ? "line-through text-muted-foreground" : ""
            }`}
          >
            {task.description}
          </button>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priority.className}`}>
              {priority.label}
            </span>
            {task.source === "ai_extracted" ? (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                <Bot size={10} /> IA
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                <User size={10} /> Manual
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserCircle2 size={11} />
              <AssigneeSelector
                currentId={task.assigneeId ?? null}
                currentName={task.assigneeName}
                members={members}
                onChange={changeAssignee}
                disabled={isPending}
                compact
              />
            </span>
          </div>
        </div>

        <button
          onClick={remove}
          disabled={isPending}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {expanded && (
        <div className="mb-2 ml-7 rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-2">
          {/* Meeting header */}
          {(task.meetingDate || task.meetingCreatedAt || task.transcriptFileName) && (
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <CalendarDays size={11} />
              Reunión: {meetingLabel}
              {task.transcriptFileName && (
                <span className="text-muted-foreground/60"> · {task.transcriptFileName}</span>
              )}
            </div>
          )}

          {/* Quote excerpt — what was actually said in the meeting */}
          {task.sourceExcerpt && (
            <div className="flex gap-2 rounded-md border-l-2 border-primary/60 bg-background/60 px-2.5 py-1.5">
              <Quote size={11} className="shrink-0 mt-0.5 text-primary/70" />
              <p className="italic text-foreground leading-relaxed">«{task.sourceExcerpt}»</p>
            </div>
          )}

          {/* Context — who/when/why */}
          {task.sourceContext && (
            <div className="flex gap-2">
              <Info size={11} className="shrink-0 mt-0.5 text-muted-foreground" />
              <p className="text-muted-foreground leading-relaxed">{task.sourceContext}</p>
            </div>
          )}

          {/* Fallback: if no excerpt/context (old tasks), show short meeting summary */}
          {!task.sourceExcerpt && !task.sourceContext && task.meetingSummary && (
            <p className="text-muted-foreground leading-relaxed line-clamp-3">
              {task.meetingSummary.replace(/\*\*/g, "").substring(0, 220)}
              {task.meetingSummary.length > 220 ? "…" : ""}
            </p>
          )}

          {/* Nothing available */}
          {!task.sourceExcerpt &&
            !task.sourceContext &&
            !task.meetingSummary &&
            task.source === "manual" && (
              <p className="text-muted-foreground italic">
                Tarea creada manualmente, sin contexto adicional.
              </p>
            )}
        </div>
      )}
    </>
  );
}

// ── Task group (by meeting) ────────────────────────────────────────────────────

interface TaskGroupProps {
  label: string;
  tasks: TaskWithContext[];
  accountId: string;
  members: WorkspaceMemberWithUser[];
  defaultOpen?: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleGroup: (ids: string[], allSelected: boolean) => void;
}

function TaskGroup({
  label,
  tasks,
  accountId,
  members,
  defaultOpen = true,
  expandedId,
  onToggleExpand,
  selectedIds,
  onToggleSelect,
  onToggleGroup,
}: TaskGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const groupIds = tasks.map((t) => t.id);
  const selectedInGroup = groupIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = selectedInGroup === groupIds.length && groupIds.length > 0;
  const someSelected = selectedInGroup > 0 && !allSelected;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={() => onToggleGroup(groupIds, allSelected)}
          className="shrink-0 w-3.5 h-3.5 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          aria-label={`Seleccionar todas las tareas de ${label}`}
        />
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <CalendarDays size={11} />
          <span>{label}</span>
          <span className="ml-auto text-muted-foreground/60">
            {tasks.length} tarea{tasks.length !== 1 ? "s" : ""}
          </span>
        </button>
      </div>
      {open && (
        <div className="px-3 divide-y divide-border">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              accountId={accountId}
              members={members}
              expanded={expandedId === t.id}
              onToggleExpand={() => onToggleExpand(t.id)}
              selected={selectedIds.has(t.id)}
              onToggleSelect={() => onToggleSelect(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface TasksPanelProps {
  tasks: TaskWithContext[];
  accountId: string;
  members: WorkspaceMemberWithUser[];
}

type Tab = "pending" | "completed";

export function TasksPanel({ tasks, accountId, members }: TasksPanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");
  const [showForm, setShowForm] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState(0);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // "all" | "unassigned" | userId
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkPending, startBulkTransition] = useTransition();

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(ids: string[], allSelected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => (tab === "pending" ? t.status === "pending" : t.status === "completed"))
      .filter((t) => priorityFilter === 0 || t.priority === priorityFilter)
      .filter((t) => {
        if (assigneeFilter === "all") return true;
        if (assigneeFilter === "unassigned") return !t.assigneeId;
        return t.assigneeId === assigneeFilter;
      })
      .filter((t) => {
        if (!dateFrom && !dateTo) return true;
        const key = taskDateKey(t);
        if (!key) return false;
        if (dateFrom && key < dateFrom) return false;
        if (dateTo && key > dateTo) return false;
        return true;
      });
  }, [tasks, tab, priorityFilter, assigneeFilter, dateFrom, dateTo]);

  // Group by transcript (meeting), newest first
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; dateKey: string; tasks: TaskWithContext[] }>();

    for (const t of filtered) {
      const key = t.transcriptId ?? "__manual__";
      if (!map.has(key)) {
        const label =
          key === "__manual__"
            ? "Tareas manuales"
            : `Reunión ${formatMeetingDate(t.meetingDate, t.meetingCreatedAt)}`;
        const dateKey = taskDateKey(t);
        map.set(key, { label, dateKey, tasks: [] });
      }
      map.get(key)!.tasks.push(t);
    }

    return [...map.entries()]
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) => {
        // Newest first; manual group last so real meetings dominate
        if (a.key === "__manual__") return 1;
        if (b.key === "__manual__") return -1;
        return b.dateKey.localeCompare(a.dateKey);
      });
  }, [filtered]);

  const allFilteredIds = filtered.map((t) => t.id);
  const allFilteredSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      allFilteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function bulkComplete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    startBulkTransition(async () => {
      await completeTasks(ids, accountId);
      clearSelection();
      router.refresh();
    });
  }

  function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`¿Eliminar ${ids.length} tarea${ids.length !== 1 ? "s" : ""}?`)) return;
    startBulkTransition(async () => {
      await deleteTasks(ids, accountId);
      clearSelection();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(
          [
            { k: "pending", label: "Pendientes", count: pendingCount },
            { k: "completed", label: "Completadas", count: completedCount },
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
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(Number(e.target.value))}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value={0}>Todas las prioridades</option>
          {Object.entries(PRIORITY_CONFIG).map(([p, { label }]) => (
            <option key={p} value={p}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">Todos los responsables</option>
          <option value="unassigned">Sin asignar</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <CalendarDays size={12} className="text-muted-foreground" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              Limpiar
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground ml-1">
          {filtered.length} {tab === "pending" ? "pendiente" : "completada"}
          {filtered.length !== 1 ? "s" : ""}
        </p>

        {tab === "pending" && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Plus size={12} /> Nueva tarea
          </button>
        )}
      </div>

      {/* New task form (only on pending tab) */}
      {tab === "pending" && showForm && (
        <NewTaskForm accountId={accountId} members={members} onDone={() => setShowForm(false)} />
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleSelectAll}
            className="shrink-0 w-3.5 h-3.5 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          />
          <span className="font-medium">
            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <button
            onClick={clearSelection}
            className="text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Deseleccionar
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {tab === "pending" && (
              <button
                onClick={bulkComplete}
                disabled={isBulkPending}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 size={12} /> Completar
              </button>
            )}
            <button
              onClick={bulkDelete}
              disabled={isBulkPending}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            >
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        </div>
      ) : (
        filtered.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <input
              type="checkbox"
              checked={false}
              readOnly
              className="shrink-0 w-3.5 h-3.5 rounded border-input text-primary cursor-pointer pointer-events-none"
            />
            Seleccionar todas ({filtered.length})
          </button>
        )
      )}

      {/* Task groups */}
      {groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map((g) => (
            <TaskGroup
              key={g.key}
              label={g.label}
              tasks={g.tasks}
              accountId={accountId}
              members={members}
              expandedId={expandedId}
              onToggleExpand={toggleExpand}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleGroup={toggleGroup}
            />
          ))}
        </div>
      ) : (
        !showForm && (
          <p className="text-sm text-muted-foreground py-2">
            {tab === "pending"
              ? "No hay tareas pendientes con esos filtros."
              : "No hay tareas completadas con esos filtros."}
          </p>
        )
      )}
    </div>
  );
}
