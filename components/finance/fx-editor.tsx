"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { upsertFxRate } from "@/app/actions/finance";
import type { FxRateRow } from "@/lib/queries/finance";

interface Props {
  rates: FxRateRow[];
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

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed";

const inputClass =
  "rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 w-full";

export function FxEditor({ rates }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<string>(String(currentYear));
  const [month, setMonth] = useState<string>("1");
  const [mepRate, setMepRate] = useState<string>("");
  const [ipcCoefficient, setIpcCoefficient] = useState<string>("1");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedYear = parseInt(year, 10);
    const parsedMonth = parseInt(month, 10);
    const parsedMep = parseFloat(mepRate);
    const parsedIpc = ipcCoefficient.trim() === "" ? null : parseFloat(ipcCoefficient);

    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      setError("Año inválido");
      return;
    }
    if (isNaN(parsedMep) || parsedMep <= 0) {
      setError("MEP inválido");
      return;
    }
    if (parsedIpc !== null && (isNaN(parsedIpc) || parsedIpc <= 0)) {
      setError("IPC inválido");
      return;
    }

    startTransition(async () => {
      const res = await upsertFxRate({
        year: parsedYear,
        month: parsedMonth,
        mepRate: parsedMep,
        ipcCoefficient: parsedIpc,
      });
      if (!res.success) {
        setError(res.error ?? "Error al guardar");
        return;
      }
      setMepRate("");
      setIpcCoefficient("1");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Tipos de cambio MEP / IPC
      </h3>

      {/* Form */}
      <GlassCard className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">
          Agregar / actualizar tasa mensual
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[80px]">
            <label className="text-[11px] text-muted-foreground">Año</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min={2000}
              max={2100}
              required
              disabled={isPending}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[110px]">
            <label className="text-[11px] text-muted-foreground">Mes</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={isPending}
              className={inputClass}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {MONTHS[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[110px]">
            <label className="text-[11px] text-muted-foreground">MEP (ARS por USD)</label>
            <input
              type="number"
              value={mepRate}
              onChange={(e) => setMepRate(e.target.value)}
              placeholder="1250.50"
              min={0}
              step="0.0001"
              required
              disabled={isPending}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[110px]">
            <label className="text-[11px] text-muted-foreground">Coef. IPC (2% = 1.02)</label>
            <input
              type="number"
              value={ipcCoefficient}
              onChange={(e) => setIpcCoefficient(e.target.value)}
              placeholder="1.02"
              min={0}
              step="0.0001"
              disabled={isPending}
              className={inputClass}
            />
          </div>

          <button type="submit" disabled={isPending} className={ghostBtn}>
            <Save size={13} aria-hidden />
            {isPending ? "Guardando…" : "Guardar"}
          </button>
        </form>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </GlassCard>

      {/* Rates table */}
      {rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin tasas cargadas aún.</p>
      ) : (
        <GlassCard className="overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b [border-color:var(--glass-border)]">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Año</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Mes</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                  MEP (ARS/USD)
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                  Coef. IPC
                </th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 [border-color:var(--glass-border)] hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-2">{r.year}</td>
                  <td className="px-4 py-2">{MONTHS[r.month] ?? r.month}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {r.mepRate.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.ipcCoefficient.toLocaleString("es-AR", {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  );
}
