"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  SlidersHorizontal,
  LayoutGrid,
  List,
  UserCircle2,
  CalendarDays,
  Repeat,
  Eye,
  ArrowUpDown,
  Trash2,
} from "lucide-react";
import {
  TAREA_COLUMNS,
  columnLabel,
  PRIORITY_CONFIG,
  type TareaColumnKey,
} from "@/lib/tareas/columns";
import type { GlobalTask } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import { scopeBoardPath } from "@/lib/tareas/scope";
import { bulkUpdateTasks, bulkDeleteTasks } from "@/app/actions/tareas";

interface GlobalTasksViewProps {
  tasks: GlobalTask[];
  containers: { kind: "account" | "project" | "loose"; id: string | null; name: string }[];
  members: WorkspaceMemberWithUser[];
}

type DueFilter = "" | "overdue" | "soon" | "none";

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

function dueColor(due: string | null): string {
  const b = dueBucket(due);
  if (b === "overdue") return "text-red-600 dark:text-red-400";
  if (b === "soon") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function formatDue(due: string): string {
  return new Date(due + "T12:00:00").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });
}

type SortKey = "container" | "task" | "assignee" | "column" | "due" | "priority";

export function GlobalTasksView({
  tasks,
  containers,
  members,
}: GlobalTasksViewProps) {
  const [view, setView] = useState<"board" | "list">("board");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [container, setContainer] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");
  const [column, setColumn] = useState("");
  const [due, setDue] = useState<DueFilter>("");
  const [onlyPublic, setOnlyPublic] = useState(false);
  const [onlyRecurrent, setOnlyRecurrent] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("container");
  const [sortAsc, setSortAsc] = useState(true);

  const hasFilters =
    search.trim() !== "" ||
    container !== "" ||
    assignee !== "" ||
    priority !== "" ||
    column !== "" ||
    due !== "" ||
    onlyPublic ||
    onlyRecurrent;

  function clearFilters(): void {
    setSearch("");
    setContainer("");
    setAssignee("");
    setPriority("");
    setColumn("");
    setDue("");
    setOnlyPublic(false);
    setOnlyRecurrent(false);
  }

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${t.title ?? ""} ${t.description} ${t.containerName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (container) {
        const key =
          t.containerKind === "loose"
            ? "loose"
            : `${t.containerKind}:${t.containerId}`;
        if (key !== container) return false;
      }
      if (assignee === "unassigned") {
        if (t.assigneeId) return false;
      } else if (assignee && t.assigneeId !== assignee) {
        return false;
      }
      if (priority && t.priority !== Number(priority)) return false;
      if (column && t.column !== column) return false;
      if (due && dueBucket(t.dueDate) !== due) return false;
      if (onlyPublic && !t.isPublic) return false;
      if (onlyRecurrent && t.mentionCount <= 1) return false;
      return true;
    });
  }, [
    tasks,
    search,
    container,
    assignee,
    priority,
    column,
    due,
    onlyPublic,
    onlyRecurrent,
  ]);

  const byColumn = useMemo(() => {
    const map = {} as Record<TareaColumnKey, GlobalTask[]>;
    for (const c of TAREA_COLUMNS) map[c.key] = [];
    for (const t of filtered) map[t.column].push(t);
    return map;
  }, [filtered]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortAsc ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "container":
          av = a.containerName.toLowerCase();
          bv = b.containerName.toLowerCase();
          break;
        case "task":
          av = (a.title || a.description).toLowerCase();
          bv = (b.title || b.description).toLowerCase();
          break;
        case "assignee":
          av = (a.assigneeName ?? "~").toLowerCase();
          bv = (b.assigneeName ?? "~").toLowerCase();
          break;
        case "column":
          av = a.column;
          bv = b.column;
          break;
        case "due":
          av = a.dueDate ?? "9999";
          bv = b.dueDate ?? "9999";
          break;
        case "priority":
          av = a.priority;
          bv = b.priority;
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  function toggleSort(key: SortKey): void {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  // --- Multi-selección + acciones masivas (vista Lista) ---
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();

  const allVisibleSelected =
    sorted.length > 0 && sorted.every((t) => selected.has(t.id));

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (sorted.every((t) => next.has(t.id))) {
        for (const t of sorted) next.delete(t.id);
      } else {
        for (const t of sorted) next.add(t.id);
      }
      return next;
    });
  }

  function clearSelection(): void {
    setSelected(new Set());
  }

  function applyBulk(patch: {
    status?: string;
    assigneeId?: string | null;
    priority?: number;
  }): void {
    const ids = [...selected];
    if (ids.length === 0) return;
    startBulk(async () => {
      await bulkUpdateTasks(ids, patch);
      setSelected(new Set());
      router.refresh();
    });
  }

  function applyDelete(): void {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `¿Eliminar ${ids.length} tarea${ids.length === 1 ? "" : "s"}? No se puede deshacer.`
      )
    )
      return;
    startBulk(async () => {
      await bulkDeleteTasks(ids);
      setSelected(new Set());
      router.refresh();
    });
  }

  const selectClass =
    "rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  function taskHref(t: GlobalTask): string {
    const scope =
      t.containerKind === "account"
        ? ({ kind: "account", accountId: t.containerId as string } as const)
        : t.containerKind === "project"
        ? ({ kind: "project", projectId: t.containerId as string } as const)
        : ({ kind: "loose" } as const);
    return `${scopeBoardPath(scope)}?task=${t.id}`;
  }

  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarea o cuenta..."
            className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => setView("board")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === "board" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            <LayoutGrid size={13} /> Tablero
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            <List size={13} /> Lista
          </button>
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            hasFilters ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-accent"
          }`}
        >
          <SlidersHorizontal size={13} /> Filtros
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            <X size={13} /> Limpiar
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <select
            value={container}
            onChange={(e) => setContainer(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Contenedor: todos</option>
            {containers.map((c) => (
              <option
                key={c.kind === "loose" ? "loose" : `${c.kind}:${c.id}`}
                value={c.kind === "loose" ? "loose" : `${c.kind}:${c.id}`}
              >
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
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
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Columna: todas</option>
            {TAREA_COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
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
            value={due}
            onChange={(e) => setDue(e.target.value as DueFilter)}
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
              checked={onlyPublic}
              onChange={(e) => setOnlyPublic(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            Solo públicas
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-xs">
            <input
              type="checkbox"
              checked={onlyRecurrent}
              onChange={(e) => setOnlyRecurrent(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            Solo recurrentes
          </label>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "tarea" : "tareas"}
      </p>

      {/* Tablero */}
      {view === "board" && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TAREA_COLUMNS.map((c) => (
            <div
              key={c.key}
              className="w-72 shrink-0 rounded-xl border border-border bg-muted/30 p-2"
            >
              <div className="flex items-center gap-2 px-1 py-1">
                <span className="text-xs font-semibold text-foreground">
                  {c.label}
                </span>
                <span className="inline-flex items-center rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {byColumn[c.key].length}
                </span>
              </div>
              <div className="space-y-2 p-1">
                {byColumn[c.key].map((t) => {
                  const prio = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG[3];
                  return (
                    <Link
                      key={t.id}
                      href={taskHref(t)}
                      className="block rounded-lg border border-border bg-card p-2.5 text-sm shadow-sm hover:border-primary/40 transition-colors"
                    >
                      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                        {t.containerName}
                      </span>
                      <p className="line-clamp-2 font-medium leading-snug">
                        {t.title || t.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${prio.className}`}
                        >
                          {prio.label}
                        </span>
                        {t.assigneeName && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                            <UserCircle2 size={11} />
                            {t.assigneeName}
                          </span>
                        )}
                        {t.dueDate && (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[11px] ${dueColor(t.dueDate)}`}
                          >
                            <CalendarDays size={11} />
                            {formatDue(t.dueDate)}
                          </span>
                        )}
                        {t.mentionCount > 1 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                            <Repeat size={11} />×{t.mentionCount}
                          </span>
                        )}
                        {t.isPublic && (
                          <Eye size={12} className="text-emerald-600 dark:text-emerald-400" />
                        )}
                      </div>
                    </Link>
                  );
                })}
                {byColumn[c.key].length === 0 && (
                  <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/60">
                    Sin tareas
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {view === "list" && (
        <div className="space-y-2">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
              <span className="font-medium">
                {selected.size} seleccionada{selected.size === 1 ? "" : "s"}
              </span>
              <select
                disabled={bulkPending}
                value=""
                onChange={(e) => e.target.value && applyBulk({ status: e.target.value })}
                className={selectClass}
                aria-label="Cambiar estado"
              >
                <option value="">Estado…</option>
                {TAREA_COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                disabled={bulkPending}
                value=""
                onChange={(e) =>
                  e.target.value &&
                  applyBulk({
                    assigneeId: e.target.value === "__unassign" ? null : e.target.value,
                  })
                }
                className={selectClass}
                aria-label="Cambiar responsable"
              >
                <option value="">Responsable…</option>
                <option value="__unassign">Sin asignar</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              <select
                disabled={bulkPending}
                value=""
                onChange={(e) => e.target.value && applyBulk({ priority: Number(e.target.value) })}
                className={selectClass}
                aria-label="Cambiar prioridad"
              >
                <option value="">Prioridad…</option>
                {Object.entries(PRIORITY_CONFIG).map(([p, { label }]) => (
                  <option key={p} value={p}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={bulkPending}
                onClick={applyDelete}
                className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 size={12} /> Eliminar
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              {bulkPending && <span className="text-muted-foreground">Aplicando…</span>}
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-input"
                    aria-label="Seleccionar todas"
                  />
                </th>
                {(
                  [
                    ["container", "Contenedor"],
                    ["task", "Tarea"],
                    ["assignee", "Responsable"],
                    ["column", "Columna"],
                    ["due", "Fecha"],
                    ["priority", "Prioridad"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {label}
                      <ArrowUpDown size={11} className={sortKey === key ? "text-foreground" : "opacity-40"} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const prio = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG[3];
                return (
                  <tr
                    key={t.id}
                    className={`border-t border-border transition-colors ${
                      selected.has(t.id) ? "bg-primary/5" : "hover:bg-accent/30"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-input"
                        aria-label="Seleccionar tarea"
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.containerName}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={taskHref(t)}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {t.title || t.description}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.assigneeName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {columnLabel(t.column)}
                    </td>
                    <td className={`px-3 py-2 ${t.dueDate ? dueColor(t.dueDate) : "text-muted-foreground"}`}>
                      {t.dueDate ? formatDue(t.dueDate) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${prio.className}`}
                      >
                        {prio.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-muted-foreground/60"
                  >
                    Sin tareas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
