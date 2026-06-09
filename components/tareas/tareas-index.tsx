"use client";

import Link from "next/link";
import { ListTodo, FolderKanban } from "lucide-react";
import { labelDotClass } from "@/lib/tareas/labels";
import { NewProjectDialog } from "./new-project-dialog";
import { GlobalTasksView } from "./global-tasks-view";
import type { GlobalTask, ProjectSummary } from "@/lib/queries/tareas";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface TareasIndexProps {
  projects: ProjectSummary[];
  looseCount: number;
  globalTasks: GlobalTask[];
  containers: { kind: "account" | "project" | "loose"; id: string | null; name: string }[];
  members: WorkspaceMemberWithUser[];
}

export function TareasIndex({
  projects,
  looseCount,
  globalTasks,
  containers,
  members,
}: TareasIndexProps): React.ReactElement {
  return (
    <div className="space-y-6">
      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/app/tareas/mias"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <ListTodo size={20} className="text-primary" />
          <div>
            <p className="text-sm font-semibold">Mis tareas</p>
            <p className="text-xs text-muted-foreground">{looseCount} sueltas</p>
          </div>
        </Link>
      </div>

      {/* Proyectos */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FolderKanban size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Proyectos</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/app/tareas/proyecto/${p.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              {p.color && <span className={`h-3 w-3 rounded-full ${labelDotClass(p.color)}`} />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.taskCount} {p.taskCount === 1 ? "tarea" : "tareas"}
                </p>
              </div>
            </Link>
          ))}
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border p-4">
            <NewProjectDialog />
          </div>
        </div>
      </div>

      {/* Vista global */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Todas las tareas</h2>
        <GlobalTasksView
          tasks={globalTasks}
          containers={containers}
          members={members}
        />
      </div>
    </div>
  );
}
