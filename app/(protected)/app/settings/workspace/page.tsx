import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import {
  getWorkspaceByUserId,
  getWorkspaceMember,
  getWorkspaceMembers,
} from "@/lib/queries/workspace";
import { getPendingWorkspaceInvites } from "@/lib/queries/workspace-invites";
import { WorkspaceSettingsClient } from "@/components/workspace-settings-client";

export default async function WorkspaceSettingsPage(): Promise<React.ReactElement> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member) redirect("/auth/login");

  const [members, pendingInvites] = await Promise.all([
    getWorkspaceMembers(workspace.id),
    getPendingWorkspaceInvites(workspace.id),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link
        href="/app/portfolio"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        Portfolio
      </Link>

      <h1 className="text-2xl font-semibold mb-1">Workspace</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Gestioná el equipo y las invitaciones.
      </p>

      <WorkspaceSettingsClient
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        currentUserId={userId}
        currentUserRole={member.role}
        members={members}
        pendingInvites={pendingInvites}
        appUrl={appUrl}
      />
    </div>
  );
}
