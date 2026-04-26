import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import {
  getWorkspaceWithMember,
  getWorkspaceMembers,
} from "@/lib/queries/workspace";
import { getPendingWorkspaceInvites } from "@/lib/queries/workspace-invites";
import { getDriveConnectionForWorkspace } from "@/lib/queries/drive";
import { WorkspaceSettingsClient } from "@/components/workspace-settings-client";
import { WorkspaceDriveSection } from "@/components/workspace-drive-section";
import { WorkspaceServicesSection } from "@/components/workspace-services-section";
import { WorkspaceAgencyContextSection } from "@/components/workspace-agency-context-section";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";

interface PageProps {
  searchParams: Promise<{ drive?: string; drive_error?: string }>;
}

export default async function WorkspaceSettingsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const userId = await requireUserId();
  const result = await getWorkspaceWithMember(userId);
  if (!result) redirect("/auth/login");
  const { workspace, member } = result;

  const { drive, drive_error: driveError } = await searchParams;

  const [members, pendingInvites, driveConnection] = await Promise.all([
    getWorkspaceMembers(workspace.id),
    getPendingWorkspaceInvites(workspace.id),
    getDriveConnectionForWorkspace(workspace.id),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const canManage = member.role === "owner" || member.role === "admin";

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
        Gestioná el equipo, las invitaciones y las integraciones.
      </p>

      <div className="space-y-8">
        <WorkspaceSettingsClient
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          currentUserId={userId}
          currentUserRole={member.role}
          members={members}
          pendingInvites={pendingInvites}
          appUrl={appUrl}
        />

        <section id="services" className="scroll-mt-6">
          <WorkspaceServicesSection
            initialServices={workspace.services ?? []}
            canManage={canManage}
          />
        </section>

        <section id="agency-context" className="scroll-mt-6">
          <WorkspaceAgencyContextSection
            initialValue={workspace.agencyContext}
            canManage={canManage}
          />
        </section>

        <WorkspaceDriveSection
          connection={driveConnection}
          isConfigured={isGoogleOAuthConfigured()}
          canManage={canManage}
          driveSuccess={drive}
          driveError={driveError}
        />
      </div>
    </div>
  );
}
