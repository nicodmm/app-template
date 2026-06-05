import { getAccountKanbanTasks, listAccountTaskLabels } from "@/lib/queries/tareas";
import { KanbanBoard } from "@/components/tareas/kanban-board";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface Props {
  accountId: string;
  members: WorkspaceMemberWithUser[];
}

export async function TasksSection({ accountId, members }: Props) {
  const [boardTasks, labels] = await Promise.all([
    getAccountKanbanTasks(accountId),
    listAccountTaskLabels(accountId),
  ]);
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
        accountId={accountId}
        initialTasks={boardTasks}
        members={members}
        labels={labels}
      />
    </section>
  );
}
