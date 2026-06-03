"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { HonorarioRow } from "@/lib/queries/finance";

interface Props {
  row: HonorarioRow;
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

export function MisHonorarios({ row, year, month }: Props) {
  const router = useRouter();
  const [selYear, setSelYear] = useState<string>(String(year));
  const [selMonth, setSelMonth] = useState<string>(String(month));

  function navigate(y: string, m: string): void {
    router.push(`/app/finanzas?year=${y}&month=${m}`);
  }

  const hasFixed = row.fixed != null;
  const hasVariable = row.variable.length > 0;
  const isEmpty = !hasFixed && !hasVariable;

  const currencyEntries = Object.entries(row.totalsByCurrency).filter(
    ([, v]) => v !== 0
  );

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

      {isEmpty ? (
        <GlassCard className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wallet size={20} className="text-primary" aria-hidden />
          </div>
          <p className="text-sm font-medium mb-1">
            Sin honorarios en {MONTHS[month]} {year}
          </p>
          <p className="text-sm text-muted-foreground">
            No tenés compensación fija ni honorarios variables registrados para
            este mes.
          </p>
        </GlassCard>
      ) : (
        <>
          {/* Total summary */}
          <GlassCard variant="strong" className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Total {MONTHS[month]} {year} (ARS aprox.)
            </p>
            <p className="text-3xl font-semibold tabular-nums">
              {formatArs(row.arsApprox)}
            </p>
            {currencyEntries.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {currencyEntries.map(([cur, val]) => (
                  <span
                    key={cur}
                    className="rounded-full px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary tabular-nums"
                  >
                    {formatCur(val, cur)}
                  </span>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Fixed */}
          {hasFixed && row.fixed && (
            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Compensación fija</span>
                <span className="text-sm tabular-nums">
                  {formatCur(row.fixed.amount, row.fixed.currency)}
                </span>
              </div>
            </GlassCard>
          )}

          {/* Variable breakdown */}
          {hasVariable && (
            <GlassCard className="overflow-hidden">
              <div className="px-4 py-2.5 border-b [border-color:var(--glass-border)]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Honorarios variables por proyecto
                </h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b [border-color:var(--glass-border)]">
                    <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                      Cliente
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                      Neurona
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {row.variable.map((line, i) => (
                    <tr
                      key={`${i}-${line.accountName}-${line.neurona}`}
                      className="border-b last:border-0 [border-color:var(--glass-border)] hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-2 font-medium">{line.accountName}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {line.neurona}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCur(line.amount, line.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          )}

          <p className="text-[11px] text-muted-foreground">
            El total en ARS es aproximado: convierte USD al TC MEP del mes (ARS
            pasa directo).
          </p>
        </>
      )}
    </div>
  );
}
