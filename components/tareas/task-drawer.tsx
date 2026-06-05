"use client";

import { useState, useEffect } from "react";
import {
  X,
  Eye,
  EyeOff,
  Trash2,
  CalendarDays,
  Quote,
  Info,
  Repeat,
  MessageSquare,
} from "lucide-react";
import {
  PRIORITY_CONFIG,
  columnLabel,
} from "@/lib/tareas/columns";
import type { KanbanTask } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface TaskDrawerProps {
  task: KanbanTask | null;
  members: WorkspaceMemberWithUser[];
  onUpdate: (fields: {
    description?: string;
    priority?: number;
    assigneeId?: string | null;
    dueDate?: string | null;
    isPublic?: boolean;
  }) => void;
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

export function TaskDrawer({ task, members, onUpdate, onDelete, onClose }: TaskDrawerProps) {
  const [description, setDescription] = useState("");

  useEffect(() => {
    setDescription(task?.description ?? "");
  }, [task?.id, task?.description]);

  if (task === null) return null;

  function handleDelete(): void {
    if (!window.confirm("¿Eliminar esta tarea?")) return;
    onDelete();
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
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${priority.className}`}
            >
              {priority.label}
            </span>
            {columnLabel(task.column)}
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

          {/* Comments & attachments placeholder */}
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
            <MessageSquare size={14} />
            Comentarios y adjuntos — próximamente
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
