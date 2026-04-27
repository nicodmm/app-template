import { DemoAccountCard } from "@/components/demo/demo-account-card";
import { DEMO_ACCOUNTS } from "@/lib/demo/mock-data";

export default function DemoPortfolioPage() {
  const active = DEMO_ACCOUNTS.filter((a) => !a.closedAt);
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active.length} cuenta{active.length !== 1 ? "s" : ""} activa
            {active.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {active.map((account) => (
          <DemoAccountCard key={account.id} account={account} />
        ))}
      </div>
    </div>
  );
}
