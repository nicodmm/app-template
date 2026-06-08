import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import {
  getWorkspaceByUserId,
  getWorkspaceMembers,
} from "@/lib/queries/workspace";
import { getTaskAccessibleAccountIds } from "@/lib/queries/task-access";
import { getGlobalTasks } from "@/lib/queries/tareas";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { inArray } from "drizzle-orm";
import { GlobalTasksView } from "@/components/tareas/global-tasks-view";

export default async function TareasIndexPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const { accountIds } = await getTaskAccessibleAccountIds(userId, workspace.id);

  const [accountRows, tasks, members] = await Promise.all([
    accountIds.length > 0
      ? db
          .select({ id: accounts.id, name: accounts.name })
          .from(accounts)
          .where(inArray(accounts.id, accountIds))
          .orderBy(accounts.name)
      : Promise.resolve([]),
    getGlobalTasks(accountIds),
    getWorkspaceMembers(workspace.id),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tareas</h1>
        <p className="text-sm text-muted-foreground">
          Todas las tareas de tus cuentas en un solo lugar.
        </p>
      </div>

      {accountRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tenés cuentas con tareas asignadas.
        </p>
      ) : (
        <GlobalTasksView tasks={tasks} accounts={accountRows} members={members} />
      )}
    </div>
  );
}
