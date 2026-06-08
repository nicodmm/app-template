"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Search, X, SlidersHorizontal } from "lucide-react";
import {
  TAREA_COLUMNS,
  TAREA_COLUMN_KEYS,
  columnLabel,
  PRIORITY_CONFIG,
  type TareaColumnKey,
} from "@/lib/tareas/columns";
import type { KanbanTask, TaskLabel } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import {
  moveTask,
  createKanbanTask,
  createSubtask,
  updateTaskFields,
  deleteKanbanTask,
  createLabel,
  assignLabel,
  unassignLabel,
} from "@/app/actions/tareas";
import { TaskCard } from "./task-card";
import { TaskDrawer } from "./task-drawer";

interface KanbanBoardProps {
  accountId: string;
  currentUserId: string | null;
  initialTasks: KanbanTask[];
  members: WorkspaceMemberWithUser[];
  labels: TaskLabel[];
}

type Cols = Record<TareaColumnKey, KanbanTask[]>;

function groupByColumn(taskList: KanbanTask[]): Cols {
  const cols = {} as Cols;
  for (const key of TAREA_COLUMN_KEYS) cols[key] = [];
  // Solo las tareas top-level se muestran como tarjetas; las subtareas viven
  // dentro del drawer de su padre.
  for (const t of taskList) if (!t.parentTaskId) cols[t.column].push(t);
  return cols;
}

export interface SubtaskStat {
  total: number;
  done: number;
}

function computeSubtaskStats(taskList: KanbanTask[]): Map<string, SubtaskStat> {
  const m = new Map<string, SubtaskStat>();
  for (const t of taskList) {
    if (!t.parentTaskId) continue;
    const s = m.get(t.parentTaskId) ?? { total: 0, done: 0 };
    s.total += 1;
    if (t.column === "listas") s.done += 1;
    m.set(t.parentTaskId, s);
  }
  return m;
}

type DueFilter = "" | "overdue" | "soon" | "none";

interface TaskFilters {
  search: string;
  assignee: string; // "" = todos, "unassigned" = sin asignar, o userId
  labelId: string; // "" = todas
  priority: string; // "" = todas, o número como string
  due: DueFilter;
  onlyPublic: boolean;
}

const EMPTY_FILTERS: TaskFilters = {
  search: "",
  assignee: "",
  labelId: "",
  priority: "",
  due: "",
  onlyPublic: false,
};

function dueBucket(due: string | null): DueFilter {
  if (!due) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "";
}

function matchesFilters(task: KanbanTask, f: TaskFilters): boolean {
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const hay = `${task.title ?? ""} ${task.description ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.assignee === "unassigned") {
    if (task.assigneeId) return false;
  } else if (f.assignee && task.assigneeId !== f.assignee) {
    return false;
  }
  if (f.labelId && !task.labels.some((l) => l.id === f.labelId)) return false;
  if (f.priority && task.priority !== Number(f.priority)) return false;
  if (f.due && dueBucket(task.dueDate) !== f.due) return false;
  if (f.onlyPublic && !task.isPublic) return false;
  return true;
}

function filtersActive(f: TaskFilters): boolean {
  return (
    f.search.trim() !== "" ||
    f.assignee !== "" ||
    f.labelId !== "" ||
    f.priority !== "" ||
    f.due !== "" ||
    f.onlyPublic
  );
}

function findColumnOf(id: string, cols: Cols): TareaColumnKey | null {
  for (const key of TAREA_COLUMN_KEYS) {
    if (cols[key].some((t) => t.id === id)) return key;
  }
  return null;
}

type NewTaskInput = {
  title: string;
  priority: number;
  assigneeId: string | null;
  dueDate: string | null;
};

// ── Inline new-task form ─────────────────────────────────────────────────────

interface NewTaskFormProps {
  members: WorkspaceMemberWithUser[];
  onCreate: (input: NewTaskInput) => void;
  onDone: () => void;
}

function NewTaskForm({ members, onCreate, onDone }: NewTaskFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(3);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title, priority, assigneeId, dueDate: dueDate || null });
    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-2"
    >
      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la tarea..."
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(Number(e.target.value))}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Sin asignar</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.displayName}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Agregar
        </button>
      </div>
    </form>
  );
}

// ── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  columnKey: TareaColumnKey;
  tasks: KanbanTask[];
  members: WorkspaceMemberWithUser[];
  subtaskStats: Map<string, SubtaskStat>;
  onOpen: (task: KanbanTask) => void;
  onCreate: (column: TareaColumnKey, input: NewTaskInput) => void;
}

function Column({ columnKey, tasks, members, subtaskStats, onOpen, onCreate }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="w-72 shrink-0 rounded-xl border border-border bg-muted/30 p-2">
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="text-xs font-semibold text-foreground">
          {columnLabel(columnKey)}
        </span>
        <span className="inline-flex items-center rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Nueva tarea"
        >
          <Plus size={14} />
        </button>
      </div>

      {showForm && (
        <div className="mb-2">
          <NewTaskForm
            members={members}
            onCreate={(input) => onCreate(columnKey, input)}
            onDone={() => setShowForm(false)}
          />
        </div>
      )}

      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={`min-h-[60px] space-y-2 rounded-lg p-1 transition-colors ${
            isOver ? "bg-primary/5" : ""
          }`}
        >
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              subtaskStat={subtaskStats.get(t.id) ?? null}
              onOpen={onOpen}
            />
          ))}
          {tasks.length === 0 && !showForm && (
            <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/60">
              Sin tareas
            </p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ── Board ────────────────────────────────────────────────────────────────────

export function KanbanBoard({ accountId, currentUserId, initialTasks, members, labels }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<KanbanTask[]>(initialTasks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelCatalog, setLabelCatalog] = useState<TaskLabel[]>(labels);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Re-sync con el servidor cuando cambian los datos iniciales (navegación / carga).
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => setLabelCatalog(labels), [labels]);

  // Auto-abrir el drawer cuando se llega con ?task=<id> (desde notificaciones).
  const searchParams = useSearchParams();
  const consumedTaskParam = useRef(false);
  useEffect(() => {
    if (consumedTaskParam.current) return;
    const tid = searchParams.get("task");
    if (tid && tasks.some((t) => t.id === tid)) {
      setSelectedId(tid);
      consumedTaskParam.current = true;
    }
  }, [searchParams, tasks]);

  const cols = useMemo(() => groupByColumn(tasks), [tasks]);
  const hasFilters = filtersActive(filters);
  const filteredCols = useMemo(() => {
    if (!hasFilters) return cols;
    const out = {} as Cols;
    for (const key of TAREA_COLUMN_KEYS) {
      out[key] = cols[key].filter((t) => matchesFilters(t, filters));
    }
    return out;
  }, [cols, filters, hasFilters]);
  const subtaskStats = useMemo(() => computeSubtaskStats(tasks), [tasks]);
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  const selectedSubtasks = useMemo(
    () =>
      selectedId ? tasks.filter((t) => t.parentTaskId === selectedId) : [],
    [tasks, selectedId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function applyServer(
    prevTasks: KanbanTask[],
    run: () => Promise<{ error?: string } | undefined>,
    failMsg: string
  ): void {
    run()
      .then((res) => {
        if (res?.error) {
          setTasks(prevTasks);
          setError(res.error);
        }
      })
      .catch(() => {
        setTasks(prevTasks);
        setError(failMsg);
      });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const from = findColumnOf(activeId, cols);
    const to = (TAREA_COLUMN_KEYS as string[]).includes(overId)
      ? (overId as TareaColumnKey)
      : findColumnOf(overId, cols);
    if (!from || !to) return;

    const prevTasks = tasks;
    const next = { ...cols, [from]: [...cols[from]], [to]: [...cols[to]] };
    const moving = next[from].find((t) => t.id === activeId);
    if (!moving) return;
    next[from] = next[from].filter((t) => t.id !== activeId);
    const overIndex = next[to].findIndex((t) => t.id === overId);
    const insertAt = overIndex >= 0 ? overIndex : next[to].length;
    next[to].splice(insertAt, 0, { ...moving, column: to });
    setTasks(rebuildTasks(next));
    applyServer(
      prevTasks,
      () => moveTask(activeId, accountId, to, insertAt),
      "No se pudo mover la tarea."
    );
  }

  // Reconstruye la lista plana de tareas desde las columnas (solo top-level),
  // preservando las subtareas que no se agrupan en columnas.
  function rebuildTasks(next: Cols): KanbanTask[] {
    return [
      ...TAREA_COLUMN_KEYS.flatMap((k) => next[k]),
      ...tasks.filter((t) => t.parentTaskId),
    ];
  }

  function moveTaskToColumn(taskId: string, to: TareaColumnKey): void {
    const from = findColumnOf(taskId, cols);
    if (!from || from === to) return;

    const prevTasks = tasks;
    const next = { ...cols, [from]: [...cols[from]], [to]: [...cols[to]] };
    const moving = next[from].find((t) => t.id === taskId);
    if (!moving) return;
    next[from] = next[from].filter((t) => t.id !== taskId);
    const insertAt = next[to].length;
    next[to].push({ ...moving, column: to });
    setTasks(rebuildTasks(next));
    applyServer(
      prevTasks,
      () => moveTask(taskId, accountId, to, insertAt),
      "No se pudo mover la tarea."
    );
  }

  // Mueve una tarea a una columna sin reordenar (lo usan las subtareas para
  // marcar hecho/pendiente: backlog ↔ listas). No depende de `cols`, así que
  // funciona aunque la tarea no se dibuje como tarjeta en el board.
  function setTaskColumn(taskId: string, to: TareaColumnKey): void {
    const prevTasks = tasks;
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId ? { ...t, column: to, status: to } : t
      )
    );
    applyServer(
      prevTasks,
      () => moveTask(taskId, accountId, to, 0),
      "No se pudo mover la tarea."
    );
  }

  function addSubtask(parentTaskId: string, title: string): void {
    if (!title.trim()) return;
    const prevTasks = tasks;
    const tempId = `temp-sub-${parentTaskId}-${title.slice(0, 8)}-${tasks.length}`;
    const optimistic: KanbanTask = {
      id: tempId,
      accountId,
      workspaceId: "",
      transcriptId: null,
      contextDocumentId: null,
      createdBy: null,
      assigneeId: null,
      parentTaskId,
      title: title.trim(),
      description: "",
      status: "backlog",
      source: "manual",
      sourceExcerpt: null,
      sourceContext: null,
      priority: 3,
      isPublic: false,
      dueDate: null,
      sortOrder: 0,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      column: "backlog",
      meetingDate: null,
      meetingCreatedAt: null,
      transcriptFileName: null,
      assigneeName: null,
      mentionCount: 0,
      commentCount: 0,
      attachmentCount: 0,
      labels: [],
    };
    setTasks((cur) => [...cur, optimistic]);
    createSubtask(accountId, parentTaskId, title)
      .then((res) => {
        if (res.error || !res.id) {
          setTasks(prevTasks);
          setError(res.error ?? "No se pudo crear la subtarea.");
          return;
        }
        const realId = res.id;
        setTasks((cur) =>
          cur.map((t) => (t.id === tempId ? { ...t, id: realId } : t))
        );
      })
      .catch(() => {
        setTasks(prevTasks);
        setError("No se pudo crear la subtarea.");
      });
  }

  function updateTask(
    taskId: string,
    fields: Parameters<typeof updateTaskFields>[2]
  ): void {
    const prevTasks = tasks;
    setTasks((cur) =>
      cur.map((t) => {
        if (t.id !== taskId) return t;
        const patched: KanbanTask = { ...t, ...fields };
        if (fields.assigneeId !== undefined) {
          const m = members.find((mm) => mm.userId === fields.assigneeId);
          patched.assigneeName = m ? m.displayName : null;
        }
        return patched;
      })
    );
    applyServer(
      prevTasks,
      () => updateTaskFields(taskId, accountId, fields),
      "No se pudo guardar el cambio."
    );
  }

  function deleteTask(taskId: string): void {
    const prevTasks = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== taskId));
    applyServer(
      prevTasks,
      () => deleteKanbanTask(taskId, accountId),
      "No se pudo eliminar la tarea."
    );
  }

  function assignTaskLabel(taskId: string, label: TaskLabel): void {
    const prevTasks = tasks;
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId && !t.labels.some((l) => l.id === label.id)
          ? { ...t, labels: [...t.labels, label] }
          : t
      )
    );
    applyServer(prevTasks, () => assignLabel(taskId, accountId, label.id), "No se pudo asignar la etiqueta.");
  }

  function unassignTaskLabel(taskId: string, labelId: string): void {
    const prevTasks = tasks;
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId ? { ...t, labels: t.labels.filter((l) => l.id !== labelId) } : t
      )
    );
    applyServer(prevTasks, () => unassignLabel(taskId, accountId, labelId), "No se pudo quitar la etiqueta.");
  }

  function createAndAssignLabel(taskId: string, name: string, color: string): void {
    createLabel(accountId, name, color)
      .then((res) => {
        if (res.error || !res.label) {
          setError(res.error ?? "No se pudo crear la etiqueta.");
          return;
        }
        const label = res.label;
        setLabelCatalog((cur) => [...cur, label].sort((a, b) => a.name.localeCompare(b.name)));
        assignTaskLabel(taskId, label);
      })
      .catch(() => setError("No se pudo crear la etiqueta."));
  }

  function createTask(
    column: TareaColumnKey,
    input: NewTaskInput
  ): void {
    const prevTasks = tasks;
    const tempId = `temp-${column}-${tasks.length}-${input.title.slice(0, 8)}`;
    const m = input.assigneeId ? members.find((mm) => mm.userId === input.assigneeId) : null;
    const optimistic: KanbanTask = {
      id: tempId,
      accountId,
      workspaceId: "",
      transcriptId: null,
      contextDocumentId: null,
      createdBy: null,
      assigneeId: input.assigneeId,
      parentTaskId: null,
      title: input.title.trim(),
      description: "",
      status: column,
      source: "manual",
      sourceExcerpt: null,
      sourceContext: null,
      priority: input.priority,
      isPublic: false,
      dueDate: input.dueDate,
      sortOrder: Number.MAX_SAFE_INTEGER,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      column,
      meetingDate: null,
      meetingCreatedAt: null,
      transcriptFileName: null,
      assigneeName: m ? m.displayName : null,
      mentionCount: 0,
      commentCount: 0,
      attachmentCount: 0,
      labels: [],
    };
    setTasks((cur) => [...cur, optimistic]);
    createKanbanTask(
      accountId,
      column,
      input.title,
      input.priority,
      input.assigneeId,
      input.dueDate
    )
      .then((res) => {
        if (res.error || !res.id) {
          setTasks(prevTasks);
          setError(res.error ?? "No se pudo crear la tarea.");
          return;
        }
        const realId = res.id;
        setTasks((cur) => cur.map((t) => (t.id === tempId ? { ...t, id: realId } : t)));
      })
      .catch(() => {
        setTasks(prevTasks);
        setError("No se pudo crear la tarea.");
      });
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="underline underline-offset-2"
          >
            Cerrar
          </button>
        </div>
      )}
      {/* Filtros + búsqueda (client-side) */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              placeholder="Buscar por título o descripción..."
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              hasFilters
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border hover:bg-accent"
            }`}
          >
            <SlidersHorizontal size={13} /> Filtros
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <X size={13} /> Limpiar
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
            <select
              value={filters.assignee}
              onChange={(e) =>
                setFilters((f) => ({ ...f, assignee: e.target.value }))
              }
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Responsable: todos</option>
              <option value="unassigned">Sin asignar</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
            </select>

            <select
              value={filters.labelId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, labelId: e.target.value }))
              }
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Etiqueta: todas</option>
              {labelCatalog.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <select
              value={filters.priority}
              onChange={(e) =>
                setFilters((f) => ({ ...f, priority: e.target.value }))
              }
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Prioridad: todas</option>
              {Object.entries(PRIORITY_CONFIG).map(([p, { label }]) => (
                <option key={p} value={p}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={filters.due}
              onChange={(e) =>
                setFilters((f) => ({ ...f, due: e.target.value as DueFilter }))
              }
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Vencimiento: cualquiera</option>
              <option value="overdue">Vencidas</option>
              <option value="soon">Próximos 7 días</option>
              <option value="none">Sin fecha</option>
            </select>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={filters.onlyPublic}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, onlyPublic: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-input"
              />
              Solo públicas
            </label>
          </div>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TAREA_COLUMNS.map((column) => (
            <Column
              key={column.key}
              columnKey={column.key}
              tasks={filteredCols[column.key]}
              members={members}
              subtaskStats={subtaskStats}
              onOpen={(t) => setSelectedId(t.id)}
              onCreate={createTask}
            />
          ))}
        </div>
      </DndContext>

      <TaskDrawer
        task={selectedTask}
        accountId={accountId}
        currentUserId={currentUserId}
        members={members}
        labelCatalog={labelCatalog}
        subtasks={selectedSubtasks}
        onOpenTask={(id) => setSelectedId(id)}
        onCreateSubtask={(title) => {
          if (selectedId) addSubtask(selectedId, title);
        }}
        onToggleSubtask={(subtaskId, done) =>
          setTaskColumn(subtaskId, done ? "listas" : "backlog")
        }
        onUpdate={(fields) => {
          if (selectedId) updateTask(selectedId, fields);
        }}
        onMove={(to) => {
          if (selectedId) moveTaskToColumn(selectedId, to);
        }}
        onAssignLabel={(label) => { if (selectedId) assignTaskLabel(selectedId, label); }}
        onUnassignLabel={(labelId) => { if (selectedId) unassignTaskLabel(selectedId, labelId); }}
        onCreateLabel={(name, color) => { if (selectedId) createAndAssignLabel(selectedId, name, color); }}
        onDelete={() => {
          if (selectedId) {
            deleteTask(selectedId);
            setSelectedId(null);
          }
        }}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
