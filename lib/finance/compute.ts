export type BillingRule = "same" | "mep" | "mep_ipc";

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

/** Variable fee amount for a share given the active period fee. */
export function shareAmount(
  shareType: "percent" | "fixed",
  shareValue: number,
  periodFee: number
): number {
  if (shareType === "percent") return round2((shareValue / 100) * periodFee);
  return round2(shareValue);
}
