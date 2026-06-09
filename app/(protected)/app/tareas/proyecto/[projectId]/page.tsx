import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import {
  canAccessProject,
  getTaskAccessibleAccountIds,
  getAccessibleProjectIds,
} from "@/lib/queries/task-access";
import {
  getProjectKanbanTasks,
  listWorkspaceTaskLabels,
  getScopeMoveTargets,
} from "@/lib/queries/tareas";
import { db } from "@/lib/drizzle/db";
import { taskProjects, taskProjectMembers } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { KanbanBoard } from "@/components/tareas/kanban-board";
import { ProjectBoardHeader } from "@/components/tareas/project-board-header";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function TareasProjectPage({ params }: PageProps) {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const { projectId } = await params;
  const allowed = await canAccessProject(userId, workspace.id, projectId);
  if (!allowed) redirect("/unauthorized");

  const [project] = await db
    .select({
      id: taskProjects.id,
      name: taskProjects.name,
      color: taskProjects.color,
      createdBy: taskProjects.createdBy,
    })
    .from(taskProjects)
    .where(and(eq(taskProjects.id, projectId), eq(taskProjects.workspaceId, workspace.id)))
    .limit(1);
  if (!project) notFound();

  const [boardTasks, members, labels, memberRows, { accountIds }, projectIds] =
    await Promise.all([
      getProjectKanbanTasks(projectId),
      getWorkspaceMembers(workspace.id),
      listWorkspaceTaskLabels(workspace.id),
      db
        .select({ userId: taskProjectMembers.userId })
        .from(taskProjectMembers)
        .where(eq(taskProjectMembers.projectId, projectId)),
      getTaskAccessibleAccountIds(userId, workspace.id),
      getAccessibleProjectIds(userId, workspace.id),
    ]);

  const moveTargets = await getScopeMoveTargets(
    accountIds,
    projectIds.filter((id) => id !== projectId)
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href="/app/tareas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={15} />
        Tareas
      </Link>
      <ProjectBoardHeader
        projectId={projectId}
        name={project.name}
        color={project.color}
        createdBy={project.createdBy}
        currentUserId={userId}
        memberIds={memberRows.map((m) => m.userId)}
        workspaceMembers={members}
      />
      <KanbanBoard
        scope={{ kind: "project", projectId }}
        currentUserId={userId}
        initialTasks={boardTasks}
        members={members}
        labels={labels}
        moveTargets={moveTargets}
      />
    </div>
  );
}
