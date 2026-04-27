import { requireUserId } from "@/lib/auth";
import { getWorkspaceWithUsage } from "@/lib/queries/workspace";
import { createDefaultWorkspace } from "@/app/actions/auth";
import { db } from "@/lib/drizzle/db";
import { users } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
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

  // Run workspace fetch and platform-admin check in parallel — both depend
  // only on userId, no need to chain. Avoids piling up Supabase auth round
  // trips on every protected page render.
  const [workspaceFirstFetch, userRoleRows] = await Promise.all([
    getWorkspaceWithUsage(userId),
    db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);

  let workspaceData = workspaceFirstFetch;
  if (!workspaceData) {
    await createDefaultWorkspace(userId, email);
    workspaceData = await getWorkspaceWithUsage(userId);
  }

  const transcriptsCount = workspaceData?.usage?.transcriptsCount ?? 0;
  const transcriptsLimit = 5;
  const plan = "Free";
  const isPlatformAdmin = userRoleRows[0]?.role === "admin";

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader userEmail={email} userInitial={userInitial} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
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
