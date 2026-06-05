"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  UserCircle2,
  CalendarDays,
  Repeat,
  Eye,
  EyeOff,
} from "lucide-react";
import { PRIORITY_CONFIG } from "@/lib/tareas/columns";
import type { KanbanTask } from "@/lib/queries/tareas";

interface TaskCardProps {
  task: KanbanTask;
  onOpen: (task: KanbanTask) => void;
}

function dueDateColor(due: string | null): string {
  if (!due) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "text-red-600 dark:text-red-400";
  if (days <= 2) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function formatDue(due: string): string {
  const d = new Date(due + "T12:00:00");
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function TaskCard({ task, onOpen }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG[3];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-border bg-card p-2.5 text-sm shadow-sm"
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Arrastrar tarea"
        >
          <GripVertical size={14} />
        </button>

        <button
          type="button"
          onClick={() => onOpen(task)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="line-clamp-2 leading-snug font-medium">{task.title || task.description}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${priority.className}`}
            >
              {priority.label}
            </span>

            {task.assigneeName && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <UserCircle2 size={11} />
                {task.assigneeName}
              </span>
            )}

            {task.dueDate && (
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] ${dueDateColor(task.dueDate)}`}
              >
                <CalendarDays size={11} />
                {formatDue(task.dueDate)}
              </span>
            )}

            {task.mentionCount > 1 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Repeat size={11} />×{task.mentionCount}
              </span>
            )}

            {task.isPublic ? (
              <Eye size={12} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <EyeOff size={12} className="text-muted-foreground" />
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
