import { FinanceAccountCard } from "./finance-account-card";
import type { FinanceAccountCard as CardData } from "@/lib/queries/finance";

export function FinanceAccountsGrid({ accounts }: { accounts: CardData[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay cuentas. Creá una desde Portfolio y aparecerá acá.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {accounts.map((a) => (
        <FinanceAccountCard key={a.id} account={a} />
      ))}
    </div>
  );
}
