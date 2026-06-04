"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import type { KanbanTask } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import { moveTask, createKanbanTask } from "@/app/actions/tareas";
import { TaskCard } from "./task-card";
import { TaskDrawer } from "./task-drawer";

interface KanbanBoardProps {
  accountId: string;
  initialTasks: KanbanTask[];
  members: WorkspaceMemberWithUser[];
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

// ── Inline new-task form ─────────────────────────────────────────────────────

interface NewTaskFormProps {
  accountId: string;
  column: TareaColumnKey;
  members: WorkspaceMemberWithUser[];
  onDone: () => void;
}

function NewTaskForm({ accountId, column, members, onDone }: NewTaskFormProps) {
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createKanbanTask(
        accountId,
        column,
        description,
        priority,
        assigneeId,
        dueDate || null
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-2"
    >
      <textarea
        autoFocus
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripción de la tarea..."
        rows={2}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          disabled={isPending || !description.trim()}
          className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "..." : "Agregar"}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

// ── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  columnKey: TareaColumnKey;
  tasks: KanbanTask[];
  accountId: string;
  members: WorkspaceMemberWithUser[];
  onOpen: (task: KanbanTask) => void;
}

function Column({ columnKey, tasks, accountId, members, onOpen }: ColumnProps) {
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
            accountId={accountId}
            column={columnKey}
            members={members}
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

export function KanbanBoard({ accountId, initialTasks, members }: KanbanBoardProps) {
  const router = useRouter();
  const [cols, setCols] = useState<Cols>(() => groupByColumn(initialTasks));
  const [selected, setSelected] = useState<KanbanTask | null>(null);

  useEffect(() => {
    setCols(groupByColumn(initialTasks));
  }, [initialTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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
    setCols((prev) => {
      const next = { ...prev, [from]: [...prev[from]], [to]: [...prev[to]] };
      const moving = next[from].find((t) => t.id === activeId);
      if (!moving) return prev;
      next[from] = next[from].filter((t) => t.id !== activeId);
      const overIndex = next[to].findIndex((t) => t.id === overId);
      const insertAt = overIndex >= 0 ? overIndex : next[to].length;
      next[to].splice(insertAt, 0, { ...moving, column: to });
      void moveTask(activeId, accountId, to, insertAt).then(() => router.refresh());
      return next;
    });
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TAREA_COLUMNS.map((column) => (
            <Column
              key={column.key}
              columnKey={column.key}
              tasks={cols[column.key]}
              accountId={accountId}
              members={members}
              onOpen={setSelected}
            />
          ))}
        </div>
      </DndContext>

      <TaskDrawer
        task={selected}
        accountId={accountId}
        members={members}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
