import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceWithMember, getWorkspaceMembers } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import { canAccessAccountTasks } from "@/lib/queries/task-access";
import { getAccountKanbanTasks } from "@/lib/queries/tareas";
import { KanbanBoard } from "@/components/tareas/kanban-board";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

export default async function TareasAccountPage({ params }: PageProps) {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const result = await getWorkspaceWithMember(userId);
  if (!result) redirect("/auth/login");
  const { workspace, member } = result;

  const { accountId } = await params;
  const allowed = await canAccessAccountTasks(userId, workspace.id, accountId);
  if (!allowed) redirect("/unauthorized");

  const account = await getAccountById(accountId, workspace.id, { userId, role: member.role });
  if (!account) notFound();

  const [boardTasks, members] = await Promise.all([
    getAccountKanbanTasks(accountId),
    getWorkspaceMembers(workspace.id),
  ]);

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
        <h1 className="text-2xl font-semibold">{account.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Tablero de tareas</p>
      </div>
      <KanbanBoard accountId={accountId} initialTasks={boardTasks} members={members} />
    </div>
  );
}
