import { CheckSquare } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { TasksPanel } from "@/components/tasks-panel";
import { getAccountTasks } from "@/lib/queries/tasks";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface Props {
  accountId: string;
  members: WorkspaceMemberWithUser[];
}

export async function TasksSection({ accountId, members }: Props) {
  const tasks = await getAccountTasks(accountId);
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const completedTasks = tasks.length - pendingTasks;

  return (
    <CollapsibleSection
      title="Tareas"
      icon={<CheckSquare size={16} aria-hidden />}
      summary={
        tasks.length === 0
          ? "sin tareas"
          : `${pendingTasks} pendiente${pendingTasks !== 1 ? "s" : ""}${
              completedTasks > 0
                ? ` · ${completedTasks} completada${completedTasks !== 1 ? "s" : ""}`
                : ""
            }`
      }
    >
      <TasksPanel tasks={tasks} accountId={accountId} members={members} />
    </CollapsibleSection>
  );
}
