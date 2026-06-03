"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { CompensationEditor } from "@/components/finance/compensation-editor";
import type { CompensationRow, HonorarioRow } from "@/lib/queries/finance";

interface Props {
  rows: HonorarioRow[];
  compensationRows: CompensationRow[];
  members: Array<{ userId: string; name: string }>;
  year: number;
  month: number;
}

const MONTHS: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
};

const inputClass =
  "rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

const arsFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatArs(n: number): string {
  return arsFmt.format(n);
}

function formatCur(amount: number, currency: string): string {
  return (
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + ` ${currency}`
  );
}

function CurrencyChips({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1 justify-end">
      {entries.map(([cur, val]) => (
        <span
          key={cur}
          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary tabular-nums"
        >
          {formatCur(val, cur)}
        </span>
      ))}
    </span>
  );
}

export function HonorariosAdmin({
  rows,
  compensationRows,
  members,
  year,
  month,
}: Props) {
  const router = useRouter();
  const [selYear, setSelYear] = useState<string>(String(year));
  const [selMonth, setSelMonth] = useState<string>(String(month));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function navigate(y: string, m: string): void {
    router.push(`/app/finanzas?tab=honorarios&year=${y}&month=${m}`);
  }

  function toggle(userId: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function variableTotalChips(
    row: HonorarioRow
  ): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const line of row.variable) {
      totals[line.currency] = (totals[line.currency] ?? 0) + line.amount;
    }
    return totals;
  }

  return (
    <div className="space-y-6">
      {/* Month nav */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Año</label>
          <input
            type="number"
            value={selYear}
            min={2000}
            max={2100}
            onChange={(e) => setSelYear(e.target.value)}
            onBlur={(e) => navigate(e.target.value, selMonth)}
            className={`${inputClass} w-[80px]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Mes</label>
          <select
            value={selMonth}
            onChange={(e) => {
              setSelMonth(e.target.value);
              navigate(selYear, e.target.value);
            }}
            className={`${inputClass} w-[130px]`}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {MONTHS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Honorarios table */}
      <GlassCard className="overflow-hidden">
        <div className="px-4 py-2.5 border-b [border-color:var(--glass-border)]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Honorarios — {MONTHS[month]} {year}
          </h3>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No hay miembros en el workspace.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b [border-color:var(--glass-border)]">
                <th className="px-4 py-2.5 w-8" />
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                  Consultor
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                  Fijo
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                  Variable
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                  Total (ARS aprox.)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded.has(row.userId);
                const hasVariable = row.variable.length > 0;
                return (
                  <Fragment key={row.userId}>
                    <tr
                      className="border-b last:border-0 [border-color:var(--glass-border)] hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-2 align-top">
                        {hasVariable && (
                          <button
                            type="button"
                            onClick={() => toggle(row.userId)}
                            aria-label={isOpen ? "Contraer" : "Expandir"}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isOpen ? (
                              <ChevronDown size={14} aria-hidden />
                            ) : (
                              <ChevronRight size={14} aria-hidden />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 font-medium align-top">{row.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums align-top">
                        {row.fixed ? (
                          formatCur(row.fixed.amount, row.fixed.currency)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right align-top">
                        <CurrencyChips totals={variableTotalChips(row)} />
                      </td>
                      <td className="px-4 py-2 text-right align-top">
                        <div className="font-medium tabular-nums">
                          {formatArs(row.arsApprox)}
                        </div>
                        <div className="mt-1">
                          <CurrencyChips totals={row.totalsByCurrency} />
                        </div>
                      </td>
                    </tr>
                    {isOpen && hasVariable && (
                      <tr
                        className="border-b last:border-0 [border-color:var(--glass-border)] bg-white/10 dark:bg-white/[0.03]"
                      >
                        <td />
                        <td colSpan={4} className="px-4 py-2">
                          <ul className="space-y-1">
                            {row.variable.map((line, i) => (
                              <li
                                key={`${row.userId}-${i}`}
                                className="flex items-center justify-between gap-3"
                              >
                                <span className="text-muted-foreground">
                                  {line.accountName}
                                  <span className="mx-1.5">·</span>
                                  {line.neurona}
                                </span>
                                <span className="tabular-nums">
                                  {formatCur(line.amount, line.currency)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </GlassCard>

      <p className="text-[11px] text-muted-foreground">
        El total en ARS es aproximado: convierte USD al TC MEP del mes (ARS pasa
        directo). Si falta el TC del mes, las líneas en USD no suman al total ARS
        pero sí aparecen en los chips por moneda.
      </p>

      {/* Compensation editor */}
      <CompensationEditor rows={compensationRows} members={members} />
    </div>
  );
}
