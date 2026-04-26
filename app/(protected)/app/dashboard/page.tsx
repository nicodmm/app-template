import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import {
  getWorkspaceByUserId,
  getWorkspaceMember,
} from "@/lib/queries/workspace";
import {
  getWorkspaceDashboardSnapshot,
  type DashboardPeriod,
} from "@/lib/queries/dashboard";
import { DashboardPeriodSelector } from "@/components/dashboard-period-selector";
import { DashboardSnapshotView } from "@/components/dashboard-snapshot";

interface DashboardPageProps {
  searchParams: Promise<{
    preset?: string;
    since?: string;
    until?: string;
  }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolvePeriod(params: {
  preset?: string;
  since?: string;
  until?: string;
}): DashboardPeriod {
  if (params.preset === "custom" && params.since && params.until) {
    return { since: params.since, until: params.until };
  }
  const days = Number.parseInt(params.preset ?? "90", 10);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 90;
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - safeDays);
  return { since: isoDate(since), until: isoDate(until) };
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");
  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member) redirect("/auth/login");

  const params = await searchParams;
  const period = resolvePeriod(params);

  const snapshot = await getWorkspaceDashboardSnapshot(
    { workspaceId: workspace.id, userId, role: member.role },
    period
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {snapshot.totalAccounts === 0
              ? member.role === "member"
                ? "Aún no tenés cuentas asignadas"
                : "Aún no tenés clientes — creá tu primera cuenta"
              : `${snapshot.totalAccounts} cliente${
                  snapshot.totalAccounts !== 1 ? "s" : ""
                } activos`}
          </p>
        </div>
        <DashboardPeriodSelector />
      </div>

      {snapshot.totalAccounts === 0 ? (
        <div className="rounded-xl py-20 text-center backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_dashed_var(--glass-border)]">
          <p className="text-sm text-muted-foreground">
            Cuando tengas cuentas activas, vas a ver acá las métricas de tu
            portfolio.
          </p>
        </div>
      ) : (
        <DashboardSnapshotView snapshot={snapshot} period={period} />
      )}
    </div>
  );
}
