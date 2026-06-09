"use client";

import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  CalendarDays,
  Quote,
  Info,
  Repeat,
  ChevronLeft,
  ListChecks,
  Square,
  CheckSquare,
  UserCircle2,
} from "lucide-react";
import { TaskComments } from "./task-comments";
import {
  PRIORITY_CONFIG,
  TAREA_COLUMNS,
  type TareaColumnKey,
} from "@/lib/tareas/columns";
import { labelChipClass, labelDotClass, LABEL_COLORS, type LabelColorKey } from "@/lib/tareas/labels";
import type { KanbanTask, TaskLabel } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import type { TaskScope } from "@/lib/tareas/scope";

interface TaskDrawerProps {
  task: KanbanTask | null;
  scope: TaskScope;
  moveTargets: { accounts: { id: string; name: string }[]; projects: { id: string; name: string }[] };
  onMoveScope: (toScope: TaskScope) => void;
  currentUserId: string | null;
  members: WorkspaceMemberWithUser[];
  labelCatalog: TaskLabel[];
  subtasks: KanbanTask[];
  onOpenTask: (taskId: string) => void;
  onCreateSubtask: (title: string) => void;
  onToggleSubtask: (subtaskId: string, done: boolean) => void;
  onUpdate: (fields: { title?: string; description?: string; priority?: number; assigneeId?: string | null; dueDate?: string | null; isPublic?: boolean }) => void;
  onMove: (column: TareaColumnKey) => void;
  onAssignLabel: (label: TaskLabel) => void;
  onUnassignLabel: (labelId: string) => void;
  onCreateLabel: (name: string, color: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

function formatMeetingDate(
  meetingDate: string | null,
  createdAt: Date | null
): string {
  const d = meetingDate
    ? new Date(meetingDate + "T12:00:00")
    : createdAt
    ? new Date(createdAt)
    : null;
  if (!d) return "Sin fecha";
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TaskDrawer({
  task,
  scope,
  moveTargets,
  onMoveScope,
  currentUserId,
  members,
  labelCatalog,
  subtasks,
  onOpenTask,
  onCreateSubtask,
  onToggleSubtask,
  onUpdate,
  onMove,
  onAssignLabel,
  onUnassignLabel,
  onCreateLabel,
  onDelete,
  onClose,
}: TaskDrawerProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [labelPanelOpen, setLabelPanelOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<LabelColorKey>(LABEL_COLORS[0].key);
  const [newSubtask, setNewSubtask] = useState("");

  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
  }, [task?.id, task?.title, task?.description]);

  if (task === null) return null;

  function handleDelete(): void {
    if (!window.confirm("¿Eliminar esta tarea?")) return;
    onDelete();
  }

  function handleAddSubtask(e: React.FormEvent): void {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    onCreateSubtask(newSubtask);
    setNewSubtask("");
  }

  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG[3];

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
      />
      <div className="absolute right-0 top-0 h-full w-full sm:max-w-2xl overflow-y-auto border-l border-border bg-card shadow-xl">
        {task.parentTaskId && (
          <button
            type="button"
            onClick={() => onOpenTask(task.parentTaskId as string)}
            className="flex w-full items-center gap-1 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={13} /> Volver a la tarea padre
          </button>
        )}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${priority.className}`}
            >
              {priority.label}
            </span>
            <select
              value={task.column}
              onChange={(e) => onMove(e.target.value as TareaColumnKey)}
              aria-label="Etapa"
              className="rounded-md border border-input bg-background px-1.5 py-1 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TAREA_COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 p-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() !== (task.title ?? "")) onUpdate({ title });
              }}
              placeholder="Título de la tarea"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description.trim() && description.trim() !== task.description) {
                  onUpdate({ description });
                }
              }}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Labels */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Etiquetas
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {task.labels.map((l) => (
                <span
                  key={l.id}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${labelChipClass(l.color)}`}
                >
                  {l.name}
                  <button
                    type="button"
                    onClick={() => onUnassignLabel(l.id)}
                    className="rounded-full hover:bg-foreground/10"
                    aria-label={`Quitar etiqueta ${l.name}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setLabelPanelOpen((v) => !v)}
                className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus size={11} /> Etiqueta
              </button>
            </div>

            {labelPanelOpen && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                {(() => {
                  const available = labelCatalog.filter(
                    (c) => !task.labels.some((l) => l.id === c.id)
                  );
                  return available.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {available.map((label) => (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => {
                            onAssignLabel(label);
                            setLabelPanelOpen(false);
                          }}
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${labelChipClass(label.color)}`}
                        >
                          {label.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/70">
                      No hay más etiquetas disponibles.
                    </p>
                  );
                })()}

                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Crear nueva
                  </p>
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="Nombre de la etiqueta..."
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {LABEL_COLORS.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setNewLabelColor(c.key)}
                        aria-label={`Color ${c.key}`}
                        className={`h-5 w-5 rounded-full ${labelDotClass(c.key)} ${
                          c.key === newLabelColor
                            ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                            : ""
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={!newLabelName.trim()}
                    onClick={() => {
                      onCreateLabel(newLabelName, newLabelColor);
                      setNewLabelName("");
                      setLabelPanelOpen(false);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    Crear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Responsable
            </label>
            <select
              value={task.assigneeId ?? ""}
              onChange={(e) => onUpdate({ assigneeId: e.target.value || null })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <CalendarDays size={12} /> Fecha límite
            </label>
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => onUpdate({ dueDate: e.target.value || null })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Prioridad
            </label>
            <select
              value={task.priority}
              onChange={(e) => onUpdate({ priority: Number(e.target.value) })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {Object.entries(PRIORITY_CONFIG).map(([p, { label }]) => (
                <option key={p} value={p}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Contenedor (mover entre cuenta / proyecto / suelta) */}
          {!task.parentTaskId && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Contenedor
              </label>
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v === "loose") onMoveScope({ kind: "loose" });
                  else if (v.startsWith("account:"))
                    onMoveScope({ kind: "account", accountId: v.slice(8) });
                  else if (v.startsWith("project:"))
                    onMoveScope({ kind: "project", projectId: v.slice(8) });
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Mover a otro contenedor…</option>
                {scope.kind !== "loose" && (
                  <option value="loose">Tareas Sueltas</option>
                )}
                {moveTargets.projects.length > 0 && (
                  <optgroup label="Proyectos">
                    {moveTargets.projects.map((p) => (
                      <option key={p.id} value={`project:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {moveTargets.accounts.length > 0 && (
                  <optgroup label="Cuentas">
                    {moveTargets.accounts.map((a) => (
                      <option key={a.id} value={`account:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {/* Public toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              {task.isPublic ? (
                <Eye size={15} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <EyeOff size={15} className="text-muted-foreground" />
              )}
              <span className="text-sm font-medium">Visible para el cliente</span>
            </div>
            <button
              type="button"
              onClick={() => onUpdate({ isPublic: !task.isPublic })}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                task.isPublic ? "bg-emerald-500" : "bg-muted-foreground/30"
              }`}
              role="switch"
              aria-checked={task.isPublic}
              aria-label="Visible para el cliente"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  task.isPublic ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>
          </div>

          {/* Subtasks (solo en tareas top-level) */}
          {!task.parentTaskId && (
            <div className="space-y-2">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <ListChecks size={12} /> Subtareas
                {subtasks.length > 0 && (
                  <span className="text-muted-foreground/70">
                    · {subtasks.filter((s) => s.column === "listas").length}/
                    {subtasks.length}
                  </span>
                )}
              </label>

              {subtasks.length > 0 && (
                <ul className="space-y-1">
                  {subtasks.map((s) => {
                    const done = s.column === "listas";
                    return (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => onToggleSubtask(s.id, !done)}
                          aria-label={done ? "Marcar pendiente" : "Marcar hecha"}
                          className={
                            done
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground hover:text-foreground transition-colors"
                          }
                        >
                          {done ? (
                            <CheckSquare size={15} />
                          ) : (
                            <Square size={15} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenTask(s.id)}
                          className="flex-1 min-w-0 text-left text-xs"
                        >
                          <span
                            className={`block truncate ${
                              done
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                            }`}
                          >
                            {s.title || s.description}
                          </span>
                        </button>
                        {s.assigneeName && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                            <UserCircle2 size={11} />
                            {s.assigneeName}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <form onSubmit={handleAddSubtask} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="Nueva subtarea..."
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="submit"
                  disabled={!newSubtask.trim()}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  <Plus size={12} /> Agregar
                </button>
              </form>
            </div>
          )}

          {/* Meeting origin */}
          {(task.mentionCount > 0 ||
            task.sourceExcerpt ||
            task.sourceContext ||
            task.transcriptFileName ||
            task.meetingDate) && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
              {(task.meetingDate ||
                task.meetingCreatedAt ||
                task.transcriptFileName) && (
                <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                  <CalendarDays size={11} />
                  Reunión:{" "}
                  {formatMeetingDate(task.meetingDate, task.meetingCreatedAt)}
                  {task.transcriptFileName && (
                    <span className="text-muted-foreground/60">
                      {" "}
                      · {task.transcriptFileName}
                    </span>
                  )}
                </div>
              )}

              {task.mentionCount > 0 && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Repeat size={11} />
                  Mencionada {task.mentionCount} vece
                  {task.mentionCount !== 1 ? "s" : ""}
                </div>
              )}

              {task.sourceExcerpt && (
                <div className="flex gap-2 rounded-md border-l-2 border-primary/60 bg-background/60 px-2.5 py-1.5">
                  <Quote size={11} className="mt-0.5 shrink-0 text-primary/70" />
                  <p className="italic leading-relaxed text-foreground">
                    «{task.sourceExcerpt}»
                  </p>
                </div>
              )}

              {task.sourceContext && (
                <div className="flex gap-2">
                  <Info size={11} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="leading-relaxed text-muted-foreground">
                    {task.sourceContext}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Comments & attachments */}
          <div className="border-t border-border pt-4">
            <TaskComments
              key={task.id}
              taskId={task.id}
              scope={scope}
              members={members}
              currentUserId={currentUserId}
            />
          </div>

          {/* Delete */}
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} /> Eliminar tarea
          </button>
        </div>
      </div>
    </div>
  );
}
