import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accounts,
  financeEngagements,
  financeEngagementPeriods,
  financeProjectionAssumptions,
} from "@/lib/drizzle/schema";
import { getFxRatesMap } from "@/lib/queries/finance";
import {
  isActiveInMonth,
  monthBounds,
  effectiveFeeCurrency,
  type BillingRule,
} from "@/lib/finance/compute";
import type {
  PortfolioRow,
  Assumptions,
  Estado,
} from "@/lib/finance/projection-model";

/**
 * One portfolio row per non-closed account. ticketUsd = sum of active engagement
 * period fees (ARS fees converted to USD at the current month's MEP). Neurona =
 * the engagement contributing the largest USD fee.
 */
export async function getPortfolioForProjection(
  workspaceId: string,
  year: number,
  month: number
): Promise<PortfolioRow[]> {
  const accts = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      endDate: accounts.endDate,
      healthSignal: accounts.healthSignal,
    })
    .from(accounts)
    .where(and(eq(accounts.workspaceId, workspaceId), isNull(accounts.closedAt)));

  if (accts.length === 0) return [];
  const accountIds = accts.map((a) => a.id);

  const engs = await db
    .select({
      id: financeEngagements.id,
      accountId: financeEngagements.accountId,
      neurona: financeEngagements.neurona,
      billingRule: financeEngagements.billingRule,
    })
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.workspaceId, workspaceId),
        eq(financeEngagements.status, "active"),
        inArray(financeEngagements.accountId, accountIds)
      )
    );

  const engIds = engs.map((e) => e.id);
  const periods = engIds.length
    ? await db
        .select({
          engagementId: financeEngagementPeriods.engagementId,
          fromDate: financeEngagementPeriods.fromDate,
          toDate: financeEngagementPeriods.toDate,
          fee: financeEngagementPeriods.fee,
          currency: financeEngagementPeriods.currency,
        })
        .from(financeEngagementPeriods)
        .where(inArray(financeEngagementPeriods.engagementId, engIds))
    : [];

  const fxMap = await getFxRatesMap(workspaceId, { year, month }, { year, month });
  const mep = fxMap.get(`${year}-${month}`)?.mepRate ?? null;

  // engagementId -> { neurona, accountId }
  const engById = new Map(engs.map((e) => [e.id, e]));
  // accountId -> { ticketUsd, bestNeurona, bestFee }
  const agg = new Map<string, { ticketUsd: number; neurona: string; bestFee: number }>();

  for (const p of periods) {
    if (!isActiveInMonth(p.fromDate, p.toDate, year, month)) continue;
    const eng = engById.get(p.engagementId);
    if (!eng) continue;
    const feeNum = Number(p.fee);
    // mep/mep_ipc ⇒ el fee ya es USD aunque esté guardado como ARS.
    const feeIsUsd =
      effectiveFeeCurrency(eng.billingRule as BillingRule, p.currency) === "USD";
    const usd = feeIsUsd ? feeNum : mep && mep > 0 ? feeNum / mep : 0;
    const cur = agg.get(eng.accountId) ?? { ticketUsd: 0, neurona: "Otro", bestFee: 0 };
    cur.ticketUsd += usd;
    if (usd > cur.bestFee) {
      cur.bestFee = usd;
      cur.neurona = eng.neurona || "Otro";
    }
    agg.set(eng.accountId, cur);
  }

  const { start } = monthBounds(year, month);

  return accts.map((a): PortfolioRow => {
    const ag = agg.get(a.id);
    const bajaFuture = !!a.endDate && a.endDate >= start;
    let estado: Estado = "Activo";
    if (bajaFuture) estado = "Se va";
    else if (a.healthSignal === "red") estado = "En riesgo";
    return {
      accountId: a.id,
      name: a.name,
      neurona: ag?.neurona ?? "Otro",
      ticketUsd: Math.round((ag?.ticketUsd ?? 0) * 100) / 100,
      estado,
      bajaMonth: a.endDate ? a.endDate.slice(0, 7) : null,
    };
  });
}

const DEFAULT_ASSUMPTIONS: Assumptions = {
  breakevenUsd: 0,
  otrosIngresosUsd: 0,
  clientesNuevosMes: 0,
  ticketMedioNuevoUsd: 0,
  churnUsdMes: 0,
  horizonteMeses: 6,
};

export async function getProjectionAssumptions(
  workspaceId: string
): Promise<Assumptions> {
  const [row] = await db
    .select()
    .from(financeProjectionAssumptions)
    .where(eq(financeProjectionAssumptions.workspaceId, workspaceId))
    .limit(1);
  if (!row) return { ...DEFAULT_ASSUMPTIONS };
  return {
    breakevenUsd: Number(row.breakevenUsd),
    otrosIngresosUsd: Number(row.otrosIngresosUsd),
    clientesNuevosMes: row.clientesNuevosMes,
    ticketMedioNuevoUsd: Number(row.ticketMedioNuevoUsd),
    churnUsdMes: Number(row.churnUsdMes),
    horizonteMeses: row.horizonteMeses,
  };
}
