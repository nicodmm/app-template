"use client";

import { useEffect, useState, useMemo } from "react";
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
import { Plus } from "lucide-react";
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
  initialTasks: KanbanTask[];
  members: WorkspaceMemberWithUser[];
  labels: TaskLabel[];
}

type Cols = Record<TareaColumnKey, KanbanTask[]>;

function groupByColumn(taskList: KanbanTask[]): Cols {
  const cols = {} as Cols;
  for (const key of TAREA_COLUMN_KEYS) cols[key] = [];
  for (const t of taskList) cols[t.column].push(t);
  return cols;
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
  onOpen: (task: KanbanTask) => void;
  onCreate: (column: TareaColumnKey, input: NewTaskInput) => void;
}

function Column({ columnKey, tasks, members, onOpen, onCreate }: ColumnProps) {
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
            <TaskCard key={t.id} task={t} onOpen={onOpen} />
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

export function KanbanBoard({ accountId, initialTasks, members, labels }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<KanbanTask[]>(initialTasks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelCatalog, setLabelCatalog] = useState<TaskLabel[]>(labels);

  // Re-sync con el servidor cuando cambian los datos iniciales (navegación / carga).
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => setLabelCatalog(labels), [labels]);

  const cols = useMemo(() => groupByColumn(tasks), [tasks]);
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

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
    const flat = TAREA_COLUMN_KEYS.flatMap((k) => next[k]);
    setTasks(flat);
    applyServer(
      prevTasks,
      () => moveTask(activeId, accountId, to, insertAt),
      "No se pudo mover la tarea."
    );
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
    setTasks(TAREA_COLUMN_KEYS.flatMap((k) => next[k]));
    applyServer(
      prevTasks,
      () => moveTask(taskId, accountId, to, insertAt),
      "No se pudo mover la tarea."
    );
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
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TAREA_COLUMNS.map((column) => (
            <Column
              key={column.key}
              columnKey={column.key}
              tasks={cols[column.key]}
              members={members}
              onOpen={(t) => setSelectedId(t.id)}
              onCreate={createTask}
            />
          ))}
        </div>
      </DndContext>

      <TaskDrawer
        task={selectedTask}
        members={members}
        labelCatalog={labelCatalog}
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
