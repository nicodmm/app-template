import { requireUserId, isCurrentUserAdmin } from "@/lib/auth";
import { getWorkspaceWithUsage } from "@/lib/queries/workspace";
import { createDefaultWorkspace } from "@/app/actions/auth";
import { Sidebar } from "@/components/sidebar";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await requireUserId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  const userInitial = email[0]?.toUpperCase() ?? "U";

  let workspaceData = await getWorkspaceWithUsage(userId);

  if (!workspaceData) {
    await createDefaultWorkspace(userId, email);
    workspaceData = await getWorkspaceWithUsage(userId);
  }

  const role = workspaceData?.member.role ?? "member";
  const transcriptsCount = workspaceData?.usage?.transcriptsCount ?? 0;
  const transcriptsLimit = 5;
  const plan = "Free";
  const isPlatformAdmin = await isCurrentUserAdmin();

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader userEmail={email} userInitial={userInitial} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          role={role}
          isPlatformAdmin={isPlatformAdmin}
          transcriptsCount={transcriptsCount}
          transcriptsLimit={transcriptsLimit}
          plan={plan}
        />
        <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>
      </div>
      <MobileTabBar />
    </div>
  );
}
