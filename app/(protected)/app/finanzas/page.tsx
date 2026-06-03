import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { requireUserId, isFinanceAdmin, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { GlassCard } from "@/components/ui/glass-card";
import {
  getBillingForMonth,
  listFxRates,
  getBillingHistory,
  getLtvByAccount,
  listFinanceAccounts,
} from "@/lib/queries/finance";
import { FinanzasTabs } from "@/components/finance/finanzas-tabs";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function FinanzasPage({ searchParams }: PageProps) {
  await requireUserId();

  const finance = await isFinanceAdmin();
  if (!finance) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock size={20} className="text-primary" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold mb-1">Sin acceso a Finanzas</h1>
          <p className="text-sm text-muted-foreground">
            No tenés permisos para ver el módulo de Finanzas. Si necesitás
            acceso, pedíselo a un administrador del workspace.
          </p>
        </GlassCard>
      </div>
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const params = await searchParams;
  const now = new Date();
  const parsedYear = params.year ? parseInt(params.year, 10) : NaN;
  const parsedMonth = params.month ? parseInt(params.month, 10) : NaN;
  const year =
    !isNaN(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : now.getFullYear();
  const month =
    !isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : now.getMonth() + 1;

  const [billing, rates, history, ltv, accountsList] = await Promise.all([
    getBillingForMonth(workspace.id, year, month),
    listFxRates(workspace.id),
    getBillingHistory(workspace.id),
    getLtvByAccount(workspace.id),
    listFinanceAccounts(workspace.id),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm text-muted-foreground">
          Facturación mensual, tipos de cambio e historial.
        </p>
      </div>
      <FinanzasTabs
        year={year}
        month={month}
        billing={billing}
        rates={rates}
        history={history}
        ltv={ltv}
        accounts={accountsList}
      />
    </div>
  );
}
