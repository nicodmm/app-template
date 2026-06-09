"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Archive, Trash2, X, Plus } from "lucide-react";
import { labelDotClass } from "@/lib/tareas/labels";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import {
  addProjectMember,
  removeProjectMember,
  archiveProject,
  deleteProject,
} from "@/app/actions/task-projects";

interface ProjectBoardHeaderProps {
  projectId: string;
  name: string;
  color: string | null;
  createdBy: string | null;
  currentUserId: string;
  memberIds: string[];
  workspaceMembers: WorkspaceMemberWithUser[];
}

export function ProjectBoardHeader({
  projectId,
  name,
  color,
  createdBy,
  currentUserId,
  memberIds,
  workspaceMembers,
}: ProjectBoardHeaderProps): React.ReactElement {
  const router = useRouter();
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<string[]>(memberIds);
  const [error, setError] = useState<string | null>(null);
  const isCreator = createdBy === currentUserId;

  function add(userId: string): void {
    setMembers((cur) => [...new Set([...cur, userId])]);
    addProjectMember(projectId, userId).then((res) => {
      if (res.error) setError(res.error);
    });
  }
  function remove(userId: string): void {
    setMembers((cur) => cur.filter((id) => id !== userId));
    removeProjectMember(projectId, userId).then((res) => {
      if (res.error) {
        setError(res.error);
        setMembers((cur) => [...new Set([...cur, userId])]);
      }
    });
  }
  function archive(): void {
    if (!window.confirm("¿Archivar este proyecto? Se ocultará del índice.")) return;
    archiveProject(projectId, true).then((res) => {
      if (res.error) setError(res.error);
      else router.push("/app/tareas");
    });
  }
  function destroy(): void {
    if (!window.confirm("¿Borrar el proyecto y TODAS sus tareas? No se puede deshacer.")) return;
    deleteProject(projectId).then((res) => {
      if (res.error) setError(res.error);
      else router.push("/app/tareas");
    });
  }

  const available = workspaceMembers.filter((m) => !members.includes(m.userId));

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {color && <span className={`h-3 w-3 rounded-full ${labelDotClass(color)}`} />}
          <h1 className="text-2xl font-semibold">{name}</h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMembersOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Users size={13} /> Miembros · {members.length}
          </button>
          <button
            type="button"
            onClick={archive}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Archive size={13} /> Archivar
          </button>
          {isCreator && (
            <button
              type="button"
              onClick={destroy}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={13} /> Borrar
            </button>
          )}
        </div>
      </div>

      {membersOpen && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-1.5">
            {members.map((id) => {
              const m = workspaceMembers.find((mm) => mm.userId === id);
              const canRemove = id !== createdBy;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-background border border-border px-2 py-0.5 text-xs"
                >
                  {m?.displayName ?? "Usuario"}
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => remove(id)}
                      aria-label="Quitar miembro"
                      className="rounded-full hover:bg-foreground/10"
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          {available.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
              {available.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => add(m.userId)}
                  className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Plus size={11} /> {m.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
