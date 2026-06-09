import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getTaskAccessibleAccountIds } from "@/lib/queries/task-access";
import {
  getUserProjects,
  getAccountSummaries,
  getLooseKanbanTasks,
} from "@/lib/queries/tareas";
import { TareasIndex } from "@/components/tareas/tareas-index";

export default async function TareasIndexPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const { accountIds } = await getTaskAccessibleAccountIds(userId, workspace.id);

  const [projects, accountSummaries, looseTasks] = await Promise.all([
    getUserProjects(userId, workspace.id),
    getAccountSummaries(accountIds),
    getLooseKanbanTasks(userId, workspace.id),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tareas</h1>
        <p className="text-sm text-muted-foreground">
          Tus tareas sueltas, proyectos y cuentas.
        </p>
      </div>
      <TareasIndex
        projects={projects}
        accounts={accountSummaries}
        looseCount={looseTasks.length}
      />
    </div>
  );
}
