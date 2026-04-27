import { DemoDashboardView } from "@/components/demo/demo-dashboard-view";
import {
  DEMO_DASHBOARD_SNAPSHOT,
  DEMO_DASHBOARD_BREAKDOWN,
  getDemoAccountsListByFilter,
} from "@/lib/demo/mock-data";

export default function DemoDashboardPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {DEMO_DASHBOARD_SNAPSHOT.totalAccounts} clientes activos · últimos
            90 días
          </p>
        </div>
      </div>
      <DemoDashboardView
        snapshot={DEMO_DASHBOARD_SNAPSHOT}
        breakdown={DEMO_DASHBOARD_BREAKDOWN}
        resolveAccountsList={getDemoAccountsListByFilter}
      />
    </div>
  );
}
