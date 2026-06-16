export type BillingRule = "same" | "mep" | "mep_ipc";

/**
 * Moneda real en la que está denominado un fee, dada su regla de facturación.
 * Las reglas "mep" y "mep_ipc" convierten un monto en USD a ARS (por TC y/o
 * IPC), así que el fee SIEMPRE es USD bajo esas reglas, aunque haya quedado
 * (mal) guardado como ARS — p.ej. cuando el LLM etiqueta mal la moneda. La regla
 * "same" factura en la moneda guardada. Usar este helper en todo lugar que
 * interprete la moneda de un período para no leer "ARS" cuando en realidad es
 * un fee USD a convertir.
 */
export function effectiveFeeCurrency(
  rule: BillingRule,
  storedCurrency: string
): string {
  return rule === "mep" || rule === "mep_ipc" ? "USD" : storedCurrency;
}

/** First and last calendar day (YYYY-MM-DD) of the given year/month (month is 1-based). */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of `month`
  const end = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/**
 * True if a [fromDate, toDate] range overlaps the given calendar month.
 * Null fromDate => not active. Null toDate => open-ended (active from fromDate on).
 * Dates are YYYY-MM-DD strings (lexicographic comparison is valid for this format).
 */
export function isActiveInMonth(
  fromDate: string | null,
  toDate: string | null,
  year: number,
  month: number
): boolean {
  if (!fromDate) return false;
  const { start, end } = monthBounds(year, month);
  if (fromDate > end) return false;
  if (toDate && toDate < start) return false;
  return true;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Convert an amount to ARS per the billing rule.
 * - ARS amounts pass through.
 * - USD with rule "same" => null (billed in USD, no ARS figure).
 * - USD with "mep"/"mep_ipc" => needs mepRate; null if missing. "mep_ipc" also multiplies by ipcCoefficient (default 1).
 */
export function convertToArs(
  amount: number,
  currency: string,
  rule: BillingRule,
  mepRate: number | null,
  ipcCoefficient: number | null
): number | null {
  if (currency === "ARS") return round2(amount);
  // currency === "USD" (or anything non-ARS treated as USD)
  if (rule === "same") return null;
  if (mepRate == null) return null;
  const base = amount * mepRate;
  if (rule === "mep_ipc") return round2(base * (ipcCoefficient ?? 1));
  return round2(base);
}

/**
 * Number of whole months from anchor {year,month} to target {year,month}.
 * 0 when same month, negative if target precedes anchor.
 */
export function monthOffset(
  anchorYear: number,
  anchorMonth: number,
  targetYear: number,
  targetMonth: number
): number {
  return (targetYear - anchorYear) * 12 + (targetMonth - anchorMonth);
}

/**
 * Billable ARS for one engagement period in a target month, applying the MEP/IPC
 * business rule:
 *  - rule "same": billed in the stored currency. ARS passes through (`fee`),
 *    unaffected by MEP/IPC; USD has no ARS figure → null.
 *  - rule "mep"/"mep_ipc": the fee is a USD amount and is ALWAYS converted to
 *    ARS, even if the stored currency says ARS (a mis-tagged USD fee).
 *  - USD + rule "mep": `fee × MEP(target month)` (one-shot conversion each month).
 *  - USD + rule "mep_ipc": the ANCHOR month (the period's first month) converts
 *    once at the anchor's MEP (`fee × anchorMep`); every subsequent month
 *    compounds the prior ARS amount by that month's IPC coefficient. So the
 *    target month = `fee × anchorMep × Π(ipcCoef of anchor+1 … target)`.
 *    `ipcCoefficients` must contain the coefficients for months anchor+1 … target
 *    in order (length === monthsFromAnchor). A null coefficient defaults to 1
 *    (no adjustment that month).
 *
 * Returns null when a required rate is missing (e.g. anchor MEP unknown), so the
 * caller can surface "sin tasa" instead of billing a wrong amount.
 */
export function computeBillableArs(params: {
  fee: number;
  currency: string;
  rule: BillingRule;
  anchorMepRate: number | null;
  targetMepRate: number | null;
  ipcCoefficients: Array<number | null>;
}): number | null {
  const { fee, currency, rule, anchorMepRate, targetMepRate, ipcCoefficients } =
    params;

  // "same": se factura en la moneda guardada. ARS pasa directo; USD no tiene
  // figura en ARS (se factura en USD).
  if (rule === "same") {
    return currency === "ARS" ? round2(fee) : null;
  }

  // "mep" / "mep_ipc": el fee es un monto en USD que se convierte a ARS. Lo
  // convertimos SIEMPRE, aunque la moneda guardada diga ARS (ver
  // effectiveFeeCurrency): un fee ARS con estas reglas es un USD mal etiquetado.
  if (rule === "mep") {
    if (targetMepRate == null) return null;
    return round2(fee * targetMepRate);
  }

  // rule === "mep_ipc": anchor-once conversion + monthly IPC compounding.
  if (anchorMepRate == null) return null;
  let amount = fee * anchorMepRate;
  for (const coef of ipcCoefficients) {
    amount *= coef ?? 1;
  }
  return round2(amount);
}

/**
 * High-level billable ARS for a period in a target month, resolving the anchor
 * (the period's first month) and the per-month rates from an fx map keyed by
 * "year-month" (see `getFxRatesMap`). Encapsulates the MEP/IPC compounding rule
 * so both monthly billing and the projection share identical logic.
 */
export function periodBillableArs(params: {
  fee: number;
  currency: string;
  rule: BillingRule;
  /** Period start (YYYY-MM-DD) — its month is the MEP anchor for mep_ipc. */
  fromDate: string;
  targetYear: number;
  targetMonth: number;
  fxByMonth: Map<string, { mepRate: number; ipcCoefficient: number }>;
}): number | null {
  const { fee, currency, rule, fromDate, targetYear, targetMonth, fxByMonth } =
    params;

  const anchorYear = parseInt(fromDate.slice(0, 4), 10);
  const anchorMonth = parseInt(fromDate.slice(5, 7), 10);

  const anchorFx = fxByMonth.get(`${anchorYear}-${anchorMonth}`) ?? null;
  const targetFx = fxByMonth.get(`${targetYear}-${targetMonth}`) ?? null;

  // IPC coefficients for months anchor+1 … target (in order).
  const offset = monthOffset(anchorYear, anchorMonth, targetYear, targetMonth);
  const ipcCoefficients: Array<number | null> = [];
  for (let k = 1; k <= offset; k++) {
    const idx = anchorYear * 12 + (anchorMonth - 1) + k;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const fx = fxByMonth.get(`${y}-${m}`) ?? null;
    ipcCoefficients.push(fx ? fx.ipcCoefficient : null);
  }

  return computeBillableArs({
    fee,
    currency,
    rule,
    anchorMepRate: anchorFx ? anchorFx.mepRate : null,
    targetMepRate: targetFx ? targetFx.mepRate : null,
    ipcCoefficients,
  });
}

/** Variable fee amount for a share given the active period fee. */
export function shareAmount(
  shareType: "percent" | "fixed",
  shareValue: number,
  periodFee: number
): number {
  if (shareType === "percent") return round2((shareValue / 100) * periodFee);
  return round2(shareValue);
}
