import { monthOffset } from "@/lib/finance/compute";

export type Estado = "Activo" | "En riesgo" | "Se va";

export interface PortfolioRow {
  accountId: string; // "" for manually-added what-if rows
  name: string;
  neurona: string;
  ticketUsd: number;
  estado: Estado;
  bajaMonth: string | null; // "YYYY-MM"
}

export interface Assumptions {
  breakevenUsd: number;
  otrosIngresosUsd: number;
  clientesNuevosMes: number;
  ticketMedioNuevoUsd: number;
  churnUsdMes: number;
  horizonteMeses: number; // 6 | 18
}

export interface MonthCol {
  key: string; // "YYYY-MM"
  label: string; // "Jun-26"
}

const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** Label like "Jun-26" for a 1-based month. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS_ES[month - 1]}-${String(year % 100).padStart(2, "0")}`;
}

/** {year,month} shifted by n months (month is 1-based). */
export function addMonth(
  year: number,
  month: number,
  n: number
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Projected-month columns: indices 1..count starting AFTER the base month. */
export function buildMonths(
  startYear: number,
  startMonth: number,
  count: number
): MonthCol[] {
  const out: MonthCol[] = [];
  for (let i = 1; i <= count; i++) {
    const { year, month } = addMonth(startYear, startMonth, i);
    out.push({ key: `${year}-${String(month).padStart(2, "0")}`, label: monthLabel(year, month) });
  }
  return out;
}

/** Month index (relative to base) at which a "YYYY-MM" baja takes effect; null if no baja. */
function bajaIndex(
  startYear: number,
  startMonth: number,
  bajaMonth: string | null
): number | null {
  if (!bajaMonth) return null;
  const by = parseInt(bajaMonth.slice(0, 4), 10);
  const bm = parseInt(bajaMonth.slice(5, 7), 10);
  if (Number.isNaN(by) || Number.isNaN(bm)) return null;
  return monthOffset(startYear, startMonth, by, bm);
}

/**
 * Sum of USD tickets present at the given month index (0 = base month).
 * A row is present if it has no baja, or the month index is at/before its baja
 * index (the client bills through its baja month inclusive, then disappears).
 */
export function baseActiveAtUsd(
  rows: PortfolioRow[],
  startYear: number,
  startMonth: number,
  monthIndex: number
): number {
  return rows.reduce((sum, r) => {
    const bi = bajaIndex(startYear, startMonth, r.bajaMonth);
    const present = bi === null ? true : monthIndex <= bi;
    return sum + (present ? r.ticketUsd || 0 : 0);
  }, 0);
}

export interface ProjectionResult {
  months: MonthCol[]; // projected months (indices 1..horizonte)
  mrrUsd: number[]; // MRR per projected month
  baseNowUsd: number; // active cartera at base month (excludes otros)
  mrrNowUsd: number; // baseNow + otros
  count: number; // number of rows
  ticketMedioUsd: number; // baseNow / count
  breakevenUsd: number;
  crossLabel: string | null; // label of first projected month >= breakeven
}

/** Core projection (USD). Ported from the reference compute()/activeAt(). */
export function computeProjection(
  rows: PortfolioRow[],
  a: Assumptions,
  startYear: number,
  startMonth: number
): ProjectionResult {
  const months = buildMonths(startYear, startMonth, a.horizonteMeses);
  const baseNowUsd = baseActiveAtUsd(rows, startYear, startMonth, 0);
  const mrrNowUsd = baseNowUsd + a.otrosIngresosUsd;
  const count = rows.length;
  const ticketMedioUsd = count ? baseNowUsd / count : 0;

  const mrrUsd: number[] = [];
  let crossLabel: string | null = null;
  for (let mi = 1; mi <= a.horizonteMeses; mi++) {
    const growth = (a.clientesNuevosMes * a.ticketMedioNuevoUsd - a.churnUsdMes) * mi;
    const v = a.otrosIngresosUsd + baseActiveAtUsd(rows, startYear, startMonth, mi) + growth;
    mrrUsd.push(v);
    if (crossLabel === null && v >= a.breakevenUsd) crossLabel = months[mi - 1].label;
  }

  return {
    months,
    mrrUsd,
    baseNowUsd,
    mrrNowUsd,
    count,
    ticketMedioUsd,
    breakevenUsd: a.breakevenUsd,
    crossLabel,
  };
}

export interface KnownFx {
  year: number;
  month: number;
  mepRate: number;
  ipcCoefficient: number;
}

/**
 * Build a MEP resolver for the ARS toggle.
 * - Month with a known rate → that mepRate.
 * - Month AFTER the latest known → latestMep compounded by the latest IPC
 *   coefficient once per month step ("MEP del mes + IPC para proyección").
 * - Otherwise (no data) → latest known mepRate, or null if there is no data at all.
 */
export function buildMepResolver(
  known: KnownFx[]
): (year: number, month: number) => number | null {
  if (known.length === 0) return () => null;
  const map = new Map<string, KnownFx>();
  let latest = known[0];
  for (const k of known) {
    map.set(`${k.year}-${k.month}`, k);
    if (k.year * 12 + k.month > latest.year * 12 + latest.month) latest = k;
  }
  return (year: number, month: number) => {
    const hit = map.get(`${year}-${month}`);
    if (hit) return hit.mepRate;
    const steps = monthOffset(latest.year, latest.month, year, month);
    if (steps <= 0) return latest.mepRate;
    const ipc = latest.ipcCoefficient || 1;
    return latest.mepRate * Math.pow(ipc, steps);
  };
}
