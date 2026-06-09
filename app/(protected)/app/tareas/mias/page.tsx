import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import {
  getTaskAccessibleAccountIds,
  getAccessibleProjectIds,
} from "@/lib/queries/task-access";
import {
  getLooseKanbanTasks,
  listWorkspaceTaskLabels,
  getScopeMoveTargets,
} from "@/lib/queries/tareas";
import { KanbanBoard } from "@/components/tareas/kanban-board";

export default async function TareasMiasPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [boardTasks, members, labels, { accountIds }, projectIds] =
    await Promise.all([
      getLooseKanbanTasks(userId, workspace.id),
      getWorkspaceMembers(workspace.id),
      listWorkspaceTaskLabels(workspace.id),
      getTaskAccessibleAccountIds(userId, workspace.id),
      getAccessibleProjectIds(userId, workspace.id),
    ]);

  const moveTargets = await getScopeMoveTargets(accountIds, projectIds);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href="/app/tareas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={15} />
        Tareas
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Tareas Sueltas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          No pertenecen a una cuenta ni proyecto.
        </p>
      </div>
      <KanbanBoard
        scope={{ kind: "loose" }}
        currentUserId={userId}
        initialTasks={boardTasks}
        members={members}
        labels={labels}
        moveTargets={moveTargets}
      />
    </div>
  );
}
