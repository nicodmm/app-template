import { DemoDashboardView } from "@/components/demo/demo-dashboard-view";
import {
  DEMO_DASHBOARD_SNAPSHOT,
  DEMO_DASHBOARD_BREAKDOWN,
  getDemoAccountsListByFilter,
} from "@/lib/demo/mock-data";
import type {
  AccountsListRow,
  HealthBucket,
} from "@/lib/queries/dashboard";

const HEALTH_BUCKETS: HealthBucket[] = ["green", "yellow", "red", "inactive"];

function buildAccountsByFilter(): Record<string, AccountsListRow[]> {
  const map: Record<string, AccountsListRow[]> = {};
  for (const b of HEALTH_BUCKETS) {
    map[`health:${b}`] = getDemoAccountsListByFilter("health", b);
  }
  for (const i of DEMO_DASHBOARD_SNAPSHOT.industries) {
    map[`industry:${i.industry}`] = getDemoAccountsListByFilter(
      "industry",
      i.industry
    );
  }
  for (const s of DEMO_DASHBOARD_SNAPSHOT.sizes) {
    map[`size:${s.employeeCount}`] = getDemoAccountsListByFilter(
      "size",
      s.employeeCount
    );
  }
  map["opportunities:_"] = getDemoAccountsListByFilter("opportunities", "_");
  return map;
}

const DEMO_ACCOUNTS_BY_FILTER = buildAccountsByFilter();

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
        accountsByFilter={DEMO_ACCOUNTS_BY_FILTER}
      />
    </div>
  );
}
