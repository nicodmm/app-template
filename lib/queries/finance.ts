import { db } from "@/lib/drizzle/db";
import {
  accountFinance,
  accounts,
  financeEngagements,
  financeEngagementPeriods,
  financeFeeShares,
  billingRecords,
  workspaceMembers,
  users,
  fxRates,
  memberCompensation,
} from "@/lib/drizzle/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  convertToArs,
  effectiveFeeCurrency,
  isActiveInMonth,
  monthBounds,
  round2,
  shareAmount,
  type BillingRule,
} from "@/lib/finance/compute";

export interface AccountTerms {
  termsRawText: string | null;
  termsStatus: string;
  termsError: string | null;
  engagements: Array<{
    id: string;
    neurona: string;
    currency: string;
    billingRule: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    source: string;
    periods: Array<{
      id: string;
      fromDate: string;
      toDate: string | null;
      fee: number;
      currency: string;
      source: string;
    }>;
    shares: Array<{
      id: string;
      memberId: string | null;
      consultantNameRaw: string | null;
      shareType: string;
      shareValue: number;
      shareCurrency: string | null;
      source: string;
    }>;
  }>;
}

export async function getAccountTerms(accountId: string): Promise<AccountTerms> {
  const [meta] = await db
    .select({
      termsRawText: accountFinance.termsRawText,
      termsStatus: accountFinance.termsStatus,
      termsError: accountFinance.termsError,
    })
    .from(accountFinance)
    .where(eq(accountFinance.accountId, accountId))
    .limit(1);

  const engagementRows = await db
    .select()
    .from(financeEngagements)
    .where(eq(financeEngagements.accountId, accountId))
    .orderBy(asc(financeEngagements.sortOrder), asc(financeEngagements.createdAt));

  const engagementIds = engagementRows.map((e) => e.id);

  const periodRows = engagementIds.length
    ? await db
        .select()
        .from(financeEngagementPeriods)
        .where(inArray(financeEngagementPeriods.engagementId, engagementIds))
        .orderBy(asc(financeEngagementPeriods.fromDate))
    : [];

  const shareRows = engagementIds.length
    ? await db
        .select()
        .from(financeFeeShares)
        .where(inArray(financeFeeShares.engagementId, engagementIds))
        .orderBy(asc(financeFeeShares.createdAt))
    : [];

  const engagements = engagementRows.map((e) => ({
    id: e.id,
    neurona: e.neurona,
    currency: e.currency,
    billingRule: e.billingRule,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
    source: e.source,
    periods: periodRows
      .filter((p) => p.engagementId === e.id)
      .map((p) => ({
        id: p.id,
        fromDate: p.fromDate,
        toDate: p.toDate,
        fee: Number(p.fee),
        currency: p.currency,
        source: p.source,
      })),
    shares: shareRows
      .filter((s) => s.engagementId === e.id)
      .map((s) => ({
        id: s.id,
        memberId: s.memberId,
        consultantNameRaw: s.consultantNameRaw,
        shareType: s.shareType,
        shareValue: Number(s.shareValue),
        shareCurrency: s.shareCurrency,
        source: s.source,
      })),
  }));

  return {
    termsRawText: meta?.termsRawText ?? null,
    termsStatus: meta?.termsStatus ?? "none",
    termsError: meta?.termsError ?? null,
    engagements,
  };
}

export interface FinanceMember {
  memberId: string;
  name: string;
}

/**
 * Workspace members keyed by the `workspace_members.id` PK (which is what
 * `finance_fee_shares.member_id` references), with a display name.
 */
export async function getFinanceMembers(
  workspaceId: string
): Promise<FinanceMember[]> {
  const rows = await db
    .select({
      memberId: workspaceMembers.id,
      fullName: users.fullName,
      email: users.email,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return rows.map((r) => ({
    memberId: r.memberId,
    name: r.fullName ?? r.email,
  }));
}

export interface FxRateRow {
  id: string;
  year: number;
  month: number;
  mepRate: number;
  ipcCoefficient: number;
}

export async function listFxRates(workspaceId: string): Promise<FxRateRow[]> {
  const rows = await db
    .select({
      id: fxRates.id,
      year: fxRates.year,
      month: fxRates.month,
      mepRate: fxRates.mepRate,
      ipcCoefficient: fxRates.ipcCoefficient,
    })
    .from(fxRates)
    .where(eq(fxRates.workspaceId, workspaceId))
    .orderBy(desc(fxRates.year), desc(fxRates.month));

  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    month: r.month,
    mepRate: Number(r.mepRate),
    ipcCoefficient: Number(r.ipcCoefficient ?? 1),
  }));
}

export async function getFxRate(
  workspaceId: string,
  year: number,
  month: number
): Promise<{ mepRate: number; ipcCoefficient: number } | null> {
  const [row] = await db
    .select({
      mepRate: fxRates.mepRate,
      ipcCoefficient: fxRates.ipcCoefficient,
    })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.workspaceId, workspaceId),
        eq(fxRates.year, year),
        eq(fxRates.month, month)
      )
    )
    .limit(1);

  if (!row) return null;
  return {
    mepRate: Number(row.mepRate),
    ipcCoefficient: Number(row.ipcCoefficient ?? 1),
  };
}

/**
 * Map of fx rates for a workspace keyed by "year-month", for the inclusive
 * [from, to] month range. Used by the MEP/IPC compounding calc, which needs the
 * anchor month's MEP plus each intervening month's IPC coefficient.
 */
export async function getFxRatesMap(
  workspaceId: string,
  from: { year: number; month: number },
  to: { year: number; month: number }
): Promise<Map<string, { mepRate: number; ipcCoefficient: number }>> {
  const fromKey = from.year * 12 + (from.month - 1);
  const toKey = to.year * 12 + (to.month - 1);
  const lo = Math.min(fromKey, toKey);
  const hi = Math.max(fromKey, toKey);

  const rows = await db
    .select({
      year: fxRates.year,
      month: fxRates.month,
      mepRate: fxRates.mepRate,
      ipcCoefficient: fxRates.ipcCoefficient,
    })
    .from(fxRates)
    .where(eq(fxRates.workspaceId, workspaceId));

  const map = new Map<string, { mepRate: number; ipcCoefficient: number }>();
  for (const r of rows) {
    const key = r.year * 12 + (r.month - 1);
    if (key < lo || key > hi) continue;
    map.set(`${r.year}-${r.month}`, {
      mepRate: Number(r.mepRate),
      ipcCoefficient: Number(r.ipcCoefficient ?? 1),
    });
  }
  return map;
}

export interface FinanceAccountCard {
  id: string;
  name: string;
  ownerName: string | null;
  fee: number | null;
  hasNda: boolean;
  hasBillingData: boolean;
  termsStatus: string;
  hasTermsText: boolean;
  closed: boolean;
}

/**
 * Cards de la pantalla de Finanzas: una por cuenta del workspace, con flags de
 * completitud para mostrar alertas (NDA, datos de facturación, términos).
 */
export async function listFinanceAccountCards(
  workspaceId: string
): Promise<FinanceAccountCard[]> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      fee: accounts.fee,
      closedAt: accounts.closedAt,
      ownerName: users.fullName,
      ownerEmail: users.email,
      ndaStoragePath: accountFinance.ndaStoragePath,
      ndaUrl: accountFinance.ndaUrl,
      razonSocial: accountFinance.razonSocial,
      cuit: accountFinance.cuit,
      termsStatus: accountFinance.termsStatus,
      termsRawText: accountFinance.termsRawText,
    })
    .from(accounts)
    .leftJoin(users, eq(accounts.ownerId, users.id))
    .leftJoin(accountFinance, eq(accountFinance.accountId, accounts.id))
    .where(eq(accounts.workspaceId, workspaceId))
    .orderBy(asc(accounts.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ownerName: r.ownerName ?? r.ownerEmail ?? null,
    fee: r.fee == null ? null : Number(r.fee),
    hasNda: !!(r.ndaStoragePath || r.ndaUrl),
    hasBillingData: !!(r.razonSocial && r.cuit),
    termsStatus: r.termsStatus ?? "none",
    hasTermsText: !!(r.termsRawText && r.termsRawText.trim()),
    closed: r.closedAt != null,
  }));
}

export interface FinanceAccountOption {
  id: string;
  name: string;
}

/** All accounts in the workspace, for the "add charge" account picker. */
export async function listFinanceAccounts(
  workspaceId: string
): Promise<FinanceAccountOption[]> {
  const rows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.workspaceId, workspaceId))
    .orderBy(asc(accounts.name));
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export interface BillingRow {
  id: string;
  accountId: string;
  accountName: string;
  concept: string;
  amountOriginal: number;
  currencyOriginal: string;
  amountArs: number | null;
  status: string;
  isAdditional: boolean;
  /**
   * Regla de facturación del engagement de origen (null para cargos adicionales
   * o huérfanos). Cuando es "same", la fila se factura en su moneda original y
   * `amountArs` es null por diseño (no requiere TC) — la UI no debe mostrar
   * "TC pendiente" en ese caso.
   */
  billingRule: string | null;
}

export async function getBillingForMonth(
  workspaceId: string,
  year: number,
  month: number
): Promise<BillingRow[]> {
  const rows = await db
    .select({
      id: billingRecords.id,
      accountId: billingRecords.accountId,
      accountName: accounts.name,
      concept: billingRecords.concept,
      amountOriginal: billingRecords.amountOriginal,
      currencyOriginal: billingRecords.currencyOriginal,
      amountArs: billingRecords.amountArs,
      status: billingRecords.status,
      isAdditional: billingRecords.isAdditional,
      billingRule: financeEngagements.billingRule,
    })
    .from(billingRecords)
    .innerJoin(accounts, eq(billingRecords.accountId, accounts.id))
    .leftJoin(
      financeEngagements,
      eq(billingRecords.engagementId, financeEngagements.id)
    )
    .where(
      and(
        eq(billingRecords.workspaceId, workspaceId),
        eq(billingRecords.year, year),
        eq(billingRecords.month, month)
      )
    )
    .orderBy(asc(accounts.name));

  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: r.accountName,
    concept: r.concept,
    amountOriginal: Number(r.amountOriginal),
    currencyOriginal: r.currencyOriginal,
    amountArs: r.amountArs == null ? null : Number(r.amountArs),
    status: r.status,
    isAdditional: r.isAdditional,
    billingRule: r.billingRule ?? null,
  }));
}

export interface BillingHistoryRow {
  year: number;
  month: number;
  totalArs: number;
  totalUsd: number;
}

export async function getBillingHistory(
  workspaceId: string
): Promise<BillingHistoryRow[]> {
  const rows = await db
    .select({
      year: billingRecords.year,
      month: billingRecords.month,
      amountArs: billingRecords.amountArs,
      amountOriginal: billingRecords.amountOriginal,
      currencyOriginal: billingRecords.currencyOriginal,
      fxRateUsed: billingRecords.fxRateUsed,
    })
    .from(billingRecords)
    .where(eq(billingRecords.workspaceId, workspaceId));

  const map = new Map<string, BillingHistoryRow>();
  for (const r of rows) {
    const key = `${r.year}-${r.month}`;
    const ars = r.amountArs == null ? 0 : Number(r.amountArs);
    const fx = r.fxRateUsed == null ? 0 : Number(r.fxRateUsed);
    const usd =
      r.currencyOriginal === "USD"
        ? Number(r.amountOriginal)
        : fx > 0
          ? ars / fx
          : 0;
    const acc =
      map.get(key) ?? { year: r.year, month: r.month, totalArs: 0, totalUsd: 0 };
    acc.totalArs += ars;
    acc.totalUsd += usd;
    map.set(key, acc);
  }

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      totalArs: round2(r.totalArs),
      totalUsd: round2(r.totalUsd),
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

export interface LtvRow {
  accountId: string;
  accountName: string;
  billedToDate: number;
  projectedArs: number;
  ltv: number;
}

/** Whole months from one {year,month} to another, inclusive of the start month
 * up to (but not including) the end month. Returns 0 if `to` is before `from`. */
function monthsBetween(
  from: { year: number; month: number },
  to: { year: number; month: number }
): number {
  const diff = (to.year - from.year) * 12 + (to.month - from.month);
  return diff < 0 ? 0 : diff;
}

/**
 * Per-account lifetime value: billed-to-date (sum of all amount_ars rows) plus
 * a rough projection of remaining contracted fees. Projection is an ESTIMATE:
 * for each active engagement we take the currently-active (or latest) period
 * fee, convert at the LATEST available fx for the workspace, and multiply by
 * the remaining months until engagement.endDate (or 12 if open-ended).
 */
export async function getLtvByAccount(workspaceId: string): Promise<LtvRow[]> {
  // Billed to date per account.
  const billedRows = await db
    .select({
      accountId: billingRecords.accountId,
      accountName: accounts.name,
      billedToDate: sql<string>`coalesce(sum(${billingRecords.amountArs}), 0)`,
    })
    .from(billingRecords)
    .innerJoin(accounts, eq(billingRecords.accountId, accounts.id))
    .where(eq(billingRecords.workspaceId, workspaceId))
    .groupBy(billingRecords.accountId, accounts.name);

  // All workspace accounts (so accounts with engagements but no billing yet
  // still appear in LTV via their projection).
  const accountRows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.workspaceId, workspaceId));

  const billedMap = new Map<string, { name: string; billedToDate: number }>();
  for (const r of billedRows) {
    billedMap.set(r.accountId, {
      name: r.accountName,
      billedToDate: Number(r.billedToDate),
    });
  }

  // Latest fx for the workspace (for the projection conversion).
  const [latestFx] = await db
    .select({ mepRate: fxRates.mepRate, ipcCoefficient: fxRates.ipcCoefficient })
    .from(fxRates)
    .where(eq(fxRates.workspaceId, workspaceId))
    .orderBy(desc(fxRates.year), desc(fxRates.month))
    .limit(1);

  const mepRate = latestFx ? Number(latestFx.mepRate) : null;
  const ipcCoefficient = latestFx ? Number(latestFx.ipcCoefficient ?? 1) : null;

  // Active engagements + their periods for the workspace.
  const engagements = await db
    .select()
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.workspaceId, workspaceId),
        eq(financeEngagements.status, "active")
      )
    );

  const engagementIds = engagements.map((e) => e.id);
  const periods = engagementIds.length
    ? await db
        .select()
        .from(financeEngagementPeriods)
        .where(inArray(financeEngagementPeriods.engagementId, engagementIds))
        .orderBy(asc(financeEngagementPeriods.fromDate))
    : [];

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  const projectedMap = new Map<string, number>();
  for (const e of engagements) {
    const ePeriods = periods.filter((p) => p.engagementId === e.id);
    if (ePeriods.length === 0) continue;
    // Prefer the period active this month, else the latest by fromDate.
    const active = ePeriods.find((p) =>
      isActiveInMonth(p.fromDate, p.toDate, curYear, curMonth)
    );
    const period = active ?? ePeriods[ePeriods.length - 1];
    const fee = Number(period.fee);
    const perMonthArs = convertToArs(
      fee,
      // mep/mep_ipc ⇒ el fee es USD aunque esté guardado como ARS.
      effectiveFeeCurrency(e.billingRule as BillingRule, period.currency),
      e.billingRule as BillingRule,
      mepRate,
      ipcCoefficient
    );
    if (perMonthArs == null) continue; // USD w/o fx or billed-in-USD: skip projection.

    let remaining = 12;
    if (e.endDate) {
      const [ey, em] = e.endDate.split("-").map((s) => parseInt(s, 10));
      remaining = monthsBetween({ year: curYear, month: curMonth }, { year: ey, month: em });
    }
    const projected = perMonthArs * remaining;
    projectedMap.set(e.accountId, (projectedMap.get(e.accountId) ?? 0) + projected);
  }

  const out: LtvRow[] = accountRows.map((a) => {
    const billed = billedMap.get(a.id)?.billedToDate ?? 0;
    const projected = projectedMap.get(a.id) ?? 0;
    return {
      accountId: a.id,
      accountName: a.name,
      billedToDate: billed,
      projectedArs: projected,
      ltv: billed + projected,
    };
  });

  return out
    .filter((r) => r.ltv > 0 || r.billedToDate > 0)
    .sort((a, b) => b.ltv - a.ltv);
}

export interface CompensationRow {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export async function listMemberCompensation(
  workspaceId: string
): Promise<CompensationRow[]> {
  const rows = await db
    .select({
      id: memberCompensation.id,
      userId: memberCompensation.userId,
      userName: users.fullName,
      userEmail: users.email,
      amount: memberCompensation.amount,
      currency: memberCompensation.currency,
      effectiveFrom: memberCompensation.effectiveFrom,
      effectiveTo: memberCompensation.effectiveTo,
    })
    .from(memberCompensation)
    .innerJoin(users, eq(users.id, memberCompensation.userId))
    .where(eq(memberCompensation.workspaceId, workspaceId))
    .orderBy(desc(memberCompensation.effectiveFrom));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName ?? r.userEmail ?? "—",
    amount: Number(r.amount),
    currency: r.currency,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  }));
}

/**
 * Pure helper: returns the active compensation row for a given userId as of
 * todayISO (effectiveFrom <= today && (effectiveTo null || effectiveTo >= today)).
 * If multiple rows match, picks the one with the latest effectiveFrom.
 * Will be reused by honorarios (Task 15).
 */
export function currentCompensation(
  rows: CompensationRow[],
  userId: string,
  todayISO: string
): CompensationRow | null {
  const active = rows.filter(
    (r) =>
      r.userId === userId &&
      r.effectiveFrom <= todayISO &&
      (r.effectiveTo == null || r.effectiveTo >= todayISO)
  );
  if (active.length === 0) return null;
  // Pick the one with the latest effectiveFrom
  return active.reduce((best, cur) =>
    cur.effectiveFrom > best.effectiveFrom ? cur : best
  );
}

export interface HonorarioLine {
  accountName: string;
  neurona: string;
  amount: number;
  currency: string;
}

export interface HonorarioRow {
  userId: string;
  name: string;
  fixed: { amount: number; currency: string } | null;
  variable: HonorarioLine[];
  /** Includes fixed + variable, summed per currency. */
  totalsByCurrency: Record<string, number>;
  /** Everything converted to ARS at MEP (USD→mep, ARS passthrough); approximate. */
  arsApprox: number;
}

/**
 * Compute monthly consultant fees (fixed compensation + variable fee-share lines)
 * for the given month. Returns one row per workspace member (admin view) or, when
 * `opts.userId` is set, exactly that one user's row.
 *
 * Member→user mapping: fee shares reference `workspace_members.id`, so we build a
 * full member map (memberId → {userId, name}) regardless of any user filter, then
 * attribute each share's amount to the member's userId. The output is filtered to
 * `opts.userId` only at assembly time.
 *
 * arsApprox: every line (fixed + variable) is converted via convertToArs with rule
 * "mep" (USD→ARS at the MEP rate, ARS passes through). If no MEP rate is loaded for
 * the month, USD lines contribute 0 to arsApprox — but they still appear in
 * `totalsByCurrency`, so nothing is lost.
 */
export async function computeHonorarios(
  workspaceId: string,
  year: number,
  month: number,
  opts?: { userId?: string }
): Promise<HonorarioRow[]> {
  // 1. Member map (memberId → {userId, name}) + list of all members.
  const memberRows = await db
    .select({
      memberId: workspaceMembers.id,
      userId: workspaceMembers.userId,
      fullName: users.fullName,
      email: users.email,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  const memberMap = new Map<string, { userId: string; name: string }>();
  const allMembers: Array<{ userId: string; name: string }> = [];
  for (const m of memberRows) {
    const name = m.fullName ?? m.email ?? "—";
    memberMap.set(m.memberId, { userId: m.userId, name });
    allMembers.push({ userId: m.userId, name });
  }

  // 2. FX for the month.
  const fx = await getFxRate(workspaceId, year, month);
  const mep = fx?.mepRate ?? null;
  const ipc = fx?.ipcCoefficient ?? null;

  // 3. Fixed compensation per user.
  const comp = await listMemberCompensation(workspaceId);
  const monthEnd = monthBounds(year, month).end;

  // 4. Variable: active engagements + accounts, their active periods, fee shares.
  const engagements = await db
    .select({
      id: financeEngagements.id,
      neurona: financeEngagements.neurona,
      currency: financeEngagements.currency,
      billingRule: financeEngagements.billingRule,
      accountName: accounts.name,
    })
    .from(financeEngagements)
    .innerJoin(accounts, eq(financeEngagements.accountId, accounts.id))
    .where(
      and(
        eq(financeEngagements.workspaceId, workspaceId),
        eq(financeEngagements.status, "active")
      )
    );

  const engagementIds = engagements.map((e) => e.id);

  const periodRows = engagementIds.length
    ? await db
        .select()
        .from(financeEngagementPeriods)
        .where(inArray(financeEngagementPeriods.engagementId, engagementIds))
        .orderBy(asc(financeEngagementPeriods.fromDate))
    : [];

  const shareRows = engagementIds.length
    ? await db
        .select()
        .from(financeFeeShares)
        .where(inArray(financeFeeShares.engagementId, engagementIds))
        .orderBy(asc(financeFeeShares.createdAt))
    : [];

  // userId → variable lines.
  const variableByUser = new Map<string, HonorarioLine[]>();

  for (const e of engagements) {
    const periods = periodRows.filter((p) => p.engagementId === e.id);
    const activePeriod = periods.find((p) =>
      isActiveInMonth(p.fromDate, p.toDate, year, month)
    );
    if (!activePeriod) continue;

    const periodFee = Number(activePeriod.fee);
    const shares = shareRows.filter((s) => s.engagementId === e.id);

    for (const s of shares) {
      if (!s.memberId) continue;
      // Both null => always applies; otherwise must overlap the month.
      const alwaysApplies = s.appliesFrom == null && s.appliesTo == null;
      if (
        !alwaysApplies &&
        !isActiveInMonth(s.appliesFrom, s.appliesTo, year, month)
      ) {
        continue;
      }

      const member = memberMap.get(s.memberId);
      if (!member) continue;

      const shareType = s.shareType === "percent" ? "percent" : "fixed";
      const amount = shareAmount(
        shareType,
        Number(s.shareValue),
        periodFee
      );
      const currency =
        shareType === "percent"
          ? // El % se calcula sobre el fee del período: su moneda es la real del
            // fee (mep/mep_ipc ⇒ USD aunque esté guardado como ARS).
            effectiveFeeCurrency(
              e.billingRule as BillingRule,
              activePeriod.currency
            )
          : s.shareCurrency ?? e.currency;

      const line: HonorarioLine = {
        accountName: e.accountName,
        neurona: e.neurona,
        amount,
        currency,
      };
      const list = variableByUser.get(member.userId);
      if (list) {
        list.push(line);
      } else {
        variableByUser.set(member.userId, [line]);
      }
    }
  }

  // 5. Assemble rows.
  const targets = opts?.userId
    ? allMembers.filter((m) => m.userId === opts.userId)
    : allMembers;

  // When filtering to a single user that isn't a member (edge case), still
  // return an empty row so the member view can render its empty state.
  if (opts?.userId && targets.length === 0) {
    targets.push({ userId: opts.userId, name: "—" });
  }

  const rows: HonorarioRow[] = targets.map((m) => {
    const compRow = currentCompensation(comp, m.userId, monthEnd);
    const fixed = compRow
      ? { amount: compRow.amount, currency: compRow.currency }
      : null;
    const variable = variableByUser.get(m.userId) ?? [];

    const totalsByCurrency: Record<string, number> = {};
    let arsApprox = 0;

    const addLine = (amount: number, currency: string): void => {
      totalsByCurrency[currency] = round2(
        (totalsByCurrency[currency] ?? 0) + amount
      );
      arsApprox += convertToArs(amount, currency, "mep", mep, ipc) ?? 0;
    };

    if (fixed) addLine(fixed.amount, fixed.currency);
    for (const line of variable) addLine(line.amount, line.currency);

    return {
      userId: m.userId,
      name: m.name,
      fixed,
      variable,
      totalsByCurrency,
      arsApprox: round2(arsApprox),
    };
  });

  return rows;
}
