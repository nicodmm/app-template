"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Pencil, Trash2, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { upsertFxRate, deleteFxRate } from "@/app/actions/finance";
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

const iconBtn =
  "shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors disabled:opacity-50";

const inputClass =
  "rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 w-full";

/** coefficient (1.02) → percentage number (2). 1 → 0. */
function coefToPct(coef: number): number {
  return Math.round((coef - 1) * 100 * 10000) / 10000;
}

/** percentage number (2) → coefficient (1.02). */
function pctToCoef(pct: number): number {
  return 1 + pct / 100;
}

export function FxEditor({ rates }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<string>(String(currentYear));
  const [month, setMonth] = useState<string>("1");
  const [mepRate, setMepRate] = useState<string>("");
  const [ipcPct, setIpcPct] = useState<string>("0");

  // When editing an existing row, remember which one (so we can drop it if the
  // year/month is changed) and surface the "edit mode" affordances.
  const [editing, setEditing] = useState<{
    id: string;
    year: number;
    month: number;
  } | null>(null);

  function resetForm() {
    setYear(String(currentYear));
    setMonth("1");
    setMepRate("");
    setIpcPct("0");
    setEditing(null);
    setError(null);
  }

  function startEdit(r: FxRateRow) {
    setError(null);
    setEditing({ id: r.id, year: r.year, month: r.month });
    setYear(String(r.year));
    setMonth(String(r.month));
    setMepRate(String(r.mepRate));
    setIpcPct(String(coefToPct(r.ipcCoefficient)));
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteFxRate({ id });
      if (!res.success) {
        setError(res.error ?? "Error al eliminar");
        return;
      }
      if (editing?.id === id) resetForm();
      router.refresh();
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedYear = parseInt(year, 10);
    const parsedMonth = parseInt(month, 10);
    const parsedMep = parseFloat(mepRate);
    const parsedPct = ipcPct.trim() === "" ? null : parseFloat(ipcPct);

    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      setError("Año inválido");
      return;
    }
    if (isNaN(parsedMep) || parsedMep <= 0) {
      setError("MEP inválido");
      return;
    }
    if (parsedPct !== null && (isNaN(parsedPct) || parsedPct < 0)) {
      setError("IPC inválido");
      return;
    }

    const ipcCoefficient = parsedPct === null ? null : pctToCoef(parsedPct);
    const movedPeriod =
      editing !== null &&
      (editing.year !== parsedYear || editing.month !== parsedMonth);

    startTransition(async () => {
      const res = await upsertFxRate({
        year: parsedYear,
        month: parsedMonth,
        mepRate: parsedMep,
        ipcCoefficient,
      });
      if (!res.success) {
        setError(res.error ?? "Error al guardar");
        return;
      }
      // If editing moved the rate to a different month, drop the original row.
      if (movedPeriod && editing) {
        const del = await deleteFxRate({ id: editing.id });
        if (!del.success) {
          setError(del.error ?? "Error al mover la tasa");
          return;
        }
      }
      resetForm();
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
          {editing
            ? `Editando ${MONTHS[editing.month]} ${editing.year}`
            : "Agregar / actualizar tasa mensual"}
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
            <label className="text-[11px] text-muted-foreground">IPC mensual (%)</label>
            <input
              type="number"
              value={ipcPct}
              onChange={(e) => setIpcPct(e.target.value)}
              placeholder="2"
              min={0}
              step="0.01"
              disabled={isPending}
              className={inputClass}
            />
          </div>

          <button type="submit" disabled={isPending} className={ghostBtn}>
            <Save size={13} aria-hidden />
            {isPending ? "Guardando…" : editing ? "Guardar cambios" : "Guardar"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              disabled={isPending}
              className={ghostBtn}
            >
              <X size={13} aria-hidden />
              Cancelar
            </button>
          )}
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
                  IPC mensual
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground" />
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
                    {coefToPct(r.ipcCoefficient).toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    %
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        disabled={isPending}
                        className={iconBtn}
                        aria-label="Editar tasa"
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        disabled={isPending}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        aria-label="Eliminar tasa"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </span>
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
