"use client";

import Link from "next/link";
import { ListTodo, FolderKanban, LayoutGrid, Building2 } from "lucide-react";
import { labelDotClass } from "@/lib/tareas/labels";
import { NewProjectDialog } from "./new-project-dialog";
import type { ProjectSummary, AccountSummary } from "@/lib/queries/tareas";

interface TareasIndexProps {
  projects: ProjectSummary[];
  accounts: AccountSummary[];
  looseCount: number;
}

export function TareasIndex({
  projects,
  accounts,
  looseCount,
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
            <p className="text-sm font-semibold">Tareas Sueltas</p>
            <p className="text-xs text-muted-foreground">
              {looseCount} {looseCount === 1 ? "tarea" : "tareas"}
            </p>
          </div>
        </Link>
        <Link
          href="/app/tareas/todas"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <LayoutGrid size={20} className="text-primary" />
          <div>
            <p className="text-sm font-semibold">Todas las tareas</p>
            <p className="text-xs text-muted-foreground">Tablero y lista global</p>
          </div>
        </Link>
      </div>

      {/* Proyectos: proyectos internos + cada cuenta como card */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FolderKanban size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Proyectos</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={`project-${p.id}`}
              href={`/app/tareas/proyecto/${p.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              {p.color && (
                <span className={`h-3 w-3 shrink-0 rounded-full ${labelDotClass(p.color)}`} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.taskCount} {p.taskCount === 1 ? "tarea" : "tareas"}
                </p>
              </div>
            </Link>
          ))}
          {accounts.map((a) => (
            <Link
              key={`account-${a.id}`}
              href={`/app/tareas/${a.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <Building2 size={16} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.taskCount} {a.taskCount === 1 ? "tarea" : "tareas"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Cuenta
              </span>
            </Link>
          ))}
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border p-4">
            <NewProjectDialog />
          </div>
        </div>
      </div>
    </div>
  );
}
