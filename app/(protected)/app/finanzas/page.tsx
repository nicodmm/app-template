import { redirect } from "next/navigation";
import { requireUserId, isFinanceAdmin, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  getBillingForMonth,
  getAccountMonthlyStatuses,
  listFxRates,
  getBillingHistory,
  listFinanceAccounts,
  listFinanceAccountCards,
  listMemberCompensation,
  computeHonorarios,
} from "@/lib/queries/finance";
import {
  getPortfolioForProjection,
  getProjectionAssumptions,
} from "@/lib/queries/projection";
import { runMonthlyBilling } from "@/lib/finance/run-monthly-billing";
import { FinanzasTabs } from "@/components/finance/finanzas-tabs";
import { MisHonorarios } from "@/components/finance/mis-honorarios";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string; tab?: string }>;
}

export default async function FinanzasPage({ searchParams }: PageProps) {
  await requireUserId();

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

  const finance = await isFinanceAdmin();

  if (!finance) {
    // Regular member: self-view of their own honorarios.
    const rows = await computeHonorarios(workspace.id, year, month, {
      userId,
    });
    const row = rows[0] ?? {
      userId,
      name: "—",
      fixed: null,
      variable: [],
      totalsByCurrency: {},
      arsApprox: 0,
    };
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Mis honorarios
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu compensación fija y honorarios variables por mes.
          </p>
        </div>
        <MisHonorarios row={row} year={year} month={month} />
      </div>
    );
  }

  // Auto-generar la facturación del mes visto (idempotente, preserva estados).
  await runMonthlyBilling(workspace.id, year, month);

  const [
    billing,
    accountStatuses,
    rates,
    history,
    accountsList,
    accountCards,
    honorarios,
    compensationRows,
    portfolio,
    assumptions,
  ] = await Promise.all([
    getBillingForMonth(workspace.id, year, month),
    getAccountMonthlyStatuses(workspace.id, year, month),
    listFxRates(workspace.id),
    getBillingHistory(workspace.id),
    listFinanceAccounts(workspace.id),
    listFinanceAccountCards(workspace.id),
    computeHonorarios(workspace.id, year, month),
    listMemberCompensation(workspace.id),
    getPortfolioForProjection(workspace.id, year, month),
    getProjectionAssumptions(workspace.id),
  ]);

  // Member options for the compensation editor (deduped by userId).
  const memberMap = new Map<string, string>();
  for (const r of honorarios) memberMap.set(r.userId, r.name);
  const members = Array.from(memberMap, ([uid, name]) => ({
    userId: uid,
    name,
  }));

  const initialTab =
    params.tab === "fx" ||
    params.tab === "honorarios" ||
    params.tab === "billing" ||
    params.tab === "accounts" ||
    params.tab === "proyeccion"
      ? params.tab
      : undefined;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm text-muted-foreground">
          Facturación mensual, tipos de cambio, honorarios e historial.
        </p>
      </div>
      <FinanzasTabs
        year={year}
        month={month}
        billing={billing}
        rates={rates}
        history={history}
        accounts={accountsList}
        accountStatuses={accountStatuses}
        accountCards={accountCards}
        honorarios={honorarios}
        compensationRows={compensationRows}
        members={members}
        portfolio={portfolio}
        assumptions={assumptions}
        baseYear={year}
        baseMonth={month}
        initialTab={initialTab}
      />
    </div>
  );
}
