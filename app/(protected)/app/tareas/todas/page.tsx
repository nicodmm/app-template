import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import {
  getTaskAccessibleAccountIds,
  getAccessibleProjectIds,
} from "@/lib/queries/task-access";
import { getGlobalTasks } from "@/lib/queries/tareas";
import { db } from "@/lib/drizzle/db";
import { accounts, taskProjects } from "@/lib/drizzle/schema";
import { inArray } from "drizzle-orm";
import { GlobalTasksView } from "@/components/tareas/global-tasks-view";

export default async function TareasTodasPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [{ accountIds }, projectIds] = await Promise.all([
    getTaskAccessibleAccountIds(userId, workspace.id),
    getAccessibleProjectIds(userId, workspace.id),
  ]);

  const [globalTasks, members, accountRows, projectRows] = await Promise.all([
    getGlobalTasks({ userId, workspaceId: workspace.id, accountIds, projectIds }),
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
    { kind: "loose" as const, id: null, name: "Tareas Sueltas" },
  ];

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
        <h1 className="text-2xl font-semibold">Todas las tareas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cuentas, proyectos y tareas sueltas en un tablero o lista.
        </p>
      </div>
      <GlobalTasksView tasks={globalTasks} containers={containers} members={members} />
    </div>
  );
}
