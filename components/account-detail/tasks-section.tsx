import Link from "next/link";
import { CheckSquare, Maximize2 } from "lucide-react";
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
import { CollapsibleSection } from "@/components/collapsible-section";
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

  let moveTargets: {
    accounts: { id: string; name: string }[];
    projects: { id: string; name: string }[];
  } = {
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

  const total = boardTasks.filter((t) => !t.parentTaskId).length;
  const done = boardTasks.filter(
    (t) => !t.parentTaskId && t.column === "listas"
  ).length;

  return (
    <CollapsibleSection
      title="Tareas"
      icon={<CheckSquare size={16} aria-hidden />}
      summary={total > 0 ? `${done}/${total} listas` : undefined}
      defaultOpen
    >
      <div className="space-y-3">
        <div className="flex justify-end">
          <Link
            href={`/app/tareas/${accountId}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Maximize2 size={12} aria-hidden /> Pantalla completa
          </Link>
        </div>
        <KanbanBoard
          scope={{ kind: "account", accountId }}
          currentUserId={currentUserId}
          initialTasks={boardTasks}
          members={members}
          labels={labels}
          moveTargets={moveTargets}
        />
      </div>
    </CollapsibleSection>
  );
}
