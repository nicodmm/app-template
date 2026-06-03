import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accounts,
  financeEngagements,
  financeEngagementPeriods,
} from "@/lib/drizzle/schema";
import { getFxRate } from "@/lib/queries/finance";
import {
  isActiveInMonth,
  convertToArs,
  round2,
  monthBounds,
  type BillingRule,
} from "@/lib/finance/compute";

export interface ProjectionMonth {
  year: number;
  month: number;
  totalArs: number;
  totalUsd: number;
}

function addMonth(
  year: number,
  month: number,
  n: number
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/**
 * Proyección de facturación de una cuenta para los próximos `months` meses.
 * Suma los fees de engagements activos cuyo período cae en cada mes, convertidos
 * a ARS al TC del mes y su equivalente USD. Si la cuenta tiene endDate, los meses
 * cuyo inicio supera esa fecha proyectan 0.
 */
export async function projectAccountBilling(
  workspaceId: string,
  accountId: string,
  fromYear: number,
  fromMonth: number,
  months = 6
): Promise<ProjectionMonth[]> {
  const engs = await db
    .select()
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.workspaceId, workspaceId),
        eq(financeEngagements.accountId, accountId),
        eq(financeEngagements.status, "active")
      )
    );
  const ids = engs.map((e) => e.id);
  const periods = ids.length
    ? await db
        .select()
        .from(financeEngagementPeriods)
        .where(inArray(financeEngagementPeriods.engagementId, ids))
    : [];

  const [acct] = await db
    .select({ endDate: accounts.endDate })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const endDate = acct?.endDate ?? null;

  const out: ProjectionMonth[] = [];
  for (let i = 0; i < months; i++) {
    const { year, month } = addMonth(fromYear, fromMonth, i);
    const { start } = monthBounds(year, month);

    if (endDate && start > endDate) {
      out.push({ year, month, totalArs: 0, totalUsd: 0 });
      continue;
    }

    const fx = await getFxRate(workspaceId, year, month);
    const mep = fx?.mepRate ?? null;
    const ipc = fx?.ipcCoefficient ?? null;

    let ars = 0;
    let usd = 0;
    for (const e of engs) {
      const p = periods.find(
        (pp) =>
          pp.engagementId === e.id &&
          isActiveInMonth(pp.fromDate, pp.toDate, year, month)
      );
      if (!p) continue;
      const fee = Number(p.fee);
      const arsAmt = convertToArs(
        fee,
        p.currency,
        e.billingRule as BillingRule,
        mep,
        ipc
      );
      if (arsAmt != null) ars += arsAmt;
      usd += p.currency === "USD" ? fee : mep && mep > 0 ? fee / mep : 0;
    }
    out.push({ year, month, totalArs: round2(ars), totalUsd: round2(usd) });
  }
  return out;
}
