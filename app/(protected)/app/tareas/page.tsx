import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import {
  getTaskAccessibleAccountIds,
  getAccessibleProjectIds,
} from "@/lib/queries/task-access";
import {
  getGlobalTasks,
  getUserProjects,
  getLooseKanbanTasks,
} from "@/lib/queries/tareas";
import { db } from "@/lib/drizzle/db";
import { accounts, taskProjects } from "@/lib/drizzle/schema";
import { inArray } from "drizzle-orm";
import { TareasIndex } from "@/components/tareas/tareas-index";

export default async function TareasIndexPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [{ accountIds }, projectIds] = await Promise.all([
    getTaskAccessibleAccountIds(userId, workspace.id),
    getAccessibleProjectIds(userId, workspace.id),
  ]);

  const [globalTasks, projects, looseTasks, members, accountRows, projectRows] =
    await Promise.all([
      getGlobalTasks({ userId, workspaceId: workspace.id, accountIds, projectIds }),
      getUserProjects(userId, workspace.id),
      getLooseKanbanTasks(userId, workspace.id),
      getWorkspaceMembers(workspace.id),
      accountIds.length > 0
        ? db
            .select({ id: accounts.id, name: accounts.name })
            .from(accounts)
            .where(inArray(accounts.id, accountIds))
            .orderBy(accounts.name)
        : Promise.resolve([]),
      projectIds.length > 0
        ? db
            .select({ id: taskProjects.id, name: taskProjects.name })
            .from(taskProjects)
            .where(inArray(taskProjects.id, projectIds))
            .orderBy(taskProjects.name)
        : Promise.resolve([]),
    ]);

  const containers: {
    kind: "account" | "project" | "loose";
    id: string | null;
    name: string;
  }[] = [
    ...accountRows.map((a) => ({ kind: "account" as const, id: a.id, name: a.name })),
    ...projectRows.map((p) => ({ kind: "project" as const, id: p.id, name: p.name })),
    { kind: "loose" as const, id: null, name: "Mis tareas" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tareas</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas, proyectos y tus tareas sueltas en un solo lugar.
        </p>
      </div>
      <TareasIndex
        projects={projects}
        looseCount={looseTasks.length}
        globalTasks={globalTasks}
        containers={containers}
        members={members}
      />
    </div>
  );
}
