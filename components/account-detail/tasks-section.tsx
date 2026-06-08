import {
  getAccountKanbanTasks,
  listAccountTaskLabels,
  getScopeMoveTargets,
} from "@/lib/queries/tareas";
import {
  getTaskAccessibleAccountIds,
  getAccessibleProjectIds,
} from "@/lib/queries/task-access";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { KanbanBoard } from "@/components/tareas/kanban-board";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface Props {
  accountId: string;
  currentUserId: string | null;
  members: WorkspaceMemberWithUser[];
}

export async function TasksSection({ accountId, currentUserId, members }: Props) {
  const [boardTasks, labels] = await Promise.all([
    getAccountKanbanTasks(accountId),
    listAccountTaskLabels(accountId),
  ]);

  let moveTargets: { accounts: { id: string; name: string }[]; projects: { id: string; name: string }[] } = {
    accounts: [],
    projects: [],
  };
  if (currentUserId) {
    const workspace = await getWorkspaceByUserId(currentUserId);
    if (workspace) {
      const [{ accountIds }, projectIds] = await Promise.all([
        getTaskAccessibleAccountIds(currentUserId, workspace.id),
        getAccessibleProjectIds(currentUserId, workspace.id),
      ]);
      moveTargets = await getScopeMoveTargets(
        accountIds.filter((id) => id !== accountId),
        projectIds
      );
    }
  }

  const total = boardTasks.length;
  const done = boardTasks.filter((t) => t.column === "listas").length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Tareas{" "}
          {total > 0 && (
            <span>
              · {done}/{total} listas
            </span>
          )}
        </h2>
      </div>
      <KanbanBoard
        scope={{ kind: "account", accountId }}
        currentUserId={currentUserId}
        initialTasks={boardTasks}
        members={members}
        labels={labels}
        moveTargets={moveTargets}
      />
    </section>
  );
}
