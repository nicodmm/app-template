"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Plus, Trash2, AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import {
  generateBillingForMonth,
  setBillingStatus,
  addBillingCharge,
  deleteBillingCharge,
} from "@/app/actions/finance";
import type {
  BillingRow,
  BillingHistoryRow,
  LtvRow,
  FinanceAccountOption,
} from "@/lib/queries/finance";

interface Props {
  year: number;
  month: number;
  billing: BillingRow[];
  history: BillingHistoryRow[];
  ltv: LtvRow[];
  accounts: FinanceAccountOption[];
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

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  billed: "Facturado",
  paid: "Cobrado",
};

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed";

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

function formatOriginal(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + ` ${currency}`;
}

export function BillingList({ year, month, billing, history, ltv, accounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selYear, setSelYear] = useState<string>(String(year));
  const [selMonth, setSelMonth] = useState<string>(String(month));

  // Add-charge form state.
  const [showCharge, setShowCharge] = useState(false);
  const [chargeAccount, setChargeAccount] = useState<string>(accounts[0]?.id ?? "");
  const [chargeConcept, setChargeConcept] = useState<string>("");
  const [chargeAmount, setChargeAmount] = useState<string>("");
  const [chargeCurrency, setChargeCurrency] = useState<string>("ARS");

  function navigate(y: string, m: string) {
    router.push(`/app/finanzas?year=${y}&month=${m}`);
  }

  function handleMonthChange(y: string, m: string) {
    setSelYear(y);
    setSelMonth(m);
    navigate(y, m);
  }

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateBillingForMonth({ year, month });
      if (!res.success) {
        setError(res.error ?? "Error al generar");
        return;
      }
      router.refresh();
    });
  }

  function handleStatus(id: string, status: "pending" | "billed" | "paid") {
    setError(null);
    startTransition(async () => {
      const res = await setBillingStatus({ id, status });
      if (!res.success) {
        setError(res.error ?? "Error al actualizar");
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteBillingCharge({ id });
      if (!res.success) {
        setError(res.error ?? "Error al eliminar");
        return;
      }
      router.refresh();
    });
  }

  function handleAddCharge(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(chargeAmount);
    if (!chargeAccount) {
      setError("Seleccioná una cuenta");
      return;
    }
    if (!chargeConcept.trim()) {
      setError("Concepto requerido");
      return;
    }
    if (isNaN(amount)) {
      setError("Monto inválido");
      return;
    }
    startTransition(async () => {
      const res = await addBillingCharge({
        accountId: chargeAccount,
        year,
        month,
        concept: chargeConcept.trim(),
        amount,
        currency: chargeCurrency,
      });
      if (!res.success) {
        setError(res.error ?? "Error al agregar");
        return;
      }
      setChargeConcept("");
      setChargeAmount("");
      setShowCharge(false);
      router.refresh();
    });
  }

  const totalArs = billing.reduce((sum, r) => sum + (r.amountArs ?? 0), 0);
  const hasPendingFx = billing.some((r) => r.amountArs == null);
  const maxHistory = history.reduce((m, h) => Math.max(m, h.totalArs), 0);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Año</label>
            <input
              type="number"
              value={selYear}
              min={2000}
              max={2100}
              disabled={isPending}
              onChange={(e) => setSelYear(e.target.value)}
              onBlur={(e) => handleMonthChange(e.target.value, selMonth)}
              className={`${inputClass} w-[80px]`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Mes</label>
            <select
              value={selMonth}
              disabled={isPending}
              onChange={(e) => handleMonthChange(selYear, e.target.value)}
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCharge((v) => !v)}
            disabled={isPending}
            className={ghostBtn}
          >
            <Plus size={13} aria-hidden />
            Agregar cargo
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className={ghostBtn}
          >
            <RefreshCw size={13} aria-hidden />
            {isPending ? "Generando…" : "Generar mes"}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Add-charge form */}
      {showCharge && (
        <GlassCard className="p-4">
          <form onSubmit={handleAddCharge} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-[11px] text-muted-foreground">Cuenta</label>
              <select
                value={chargeAccount}
                onChange={(e) => setChargeAccount(e.target.value)}
                disabled={isPending}
                className={`${inputClass} w-full`}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-[11px] text-muted-foreground">Concepto</label>
              <input
                type="text"
                value={chargeConcept}
                onChange={(e) => setChargeConcept(e.target.value)}
                placeholder="Cargo adicional"
                disabled={isPending}
                className={`${inputClass} w-full`}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[110px]">
              <label className="text-[11px] text-muted-foreground">Monto</label>
              <input
                type="number"
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
                step="0.01"
                disabled={isPending}
                className={`${inputClass} w-full`}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[90px]">
              <label className="text-[11px] text-muted-foreground">Moneda</label>
              <select
                value={chargeCurrency}
                onChange={(e) => setChargeCurrency(e.target.value)}
                disabled={isPending}
                className={`${inputClass} w-full`}
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <button type="submit" disabled={isPending} className={ghostBtn}>
              <Plus size={13} aria-hidden />
              Agregar
            </button>
          </form>
        </GlassCard>
      )}

      {/* Billing table */}
      <GlassCard className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b [border-color:var(--glass-border)]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            A facturar — {MONTHS[month]} {year}
          </h3>
          {hasPendingFx && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <AlertTriangle size={11} aria-hidden />
              TC pendiente
            </span>
          )}
        </div>

        {billing.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No hay filas para este mes. Usá “Generar mes” para crearlas a partir
            de los engagements activos.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b [border-color:var(--glass-border)]">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Cliente</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Concepto</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Monto original</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Monto ARS</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Estado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {billing.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 [border-color:var(--glass-border)] hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-2 font-medium">{r.accountName}</td>
                  <td className="px-4 py-2">
                    {r.concept}
                    {r.isAdditional && (
                      <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary">
                        adicional
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatOriginal(r.amountOriginal, r.currencyOriginal)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.amountArs == null ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={11} aria-hidden />
                        TC pendiente
                      </span>
                    ) : (
                      <span className="font-medium">{formatArs(r.amountArs)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={r.status}
                      disabled={isPending}
                      onChange={(e) =>
                        handleStatus(r.id, e.target.value as "pending" | "billed" | "paid")
                      }
                      className={inputClass}
                    >
                      {(["pending", "billed", "paid"] as const).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.isAdditional && (
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        disabled={isPending}
                        aria-label="Eliminar cargo"
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t [border-color:var(--glass-border)]">
                <td className="px-4 py-2.5 font-semibold" colSpan={3}>
                  Total ARS
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {formatArs(totalArs)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </GlassCard>

      {/* History + LTV panels */}
      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Historial facturado (ARS)
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin historial aún.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={`${h.year}-${h.month}`} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {MONTHS[h.month]} {h.year}
                  </span>
                  <span className="flex-1 h-2 rounded-full bg-white/30 dark:bg-white/10 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: `${maxHistory > 0 ? (h.totalArs / maxHistory) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums">
                    {formatArs(h.totalArs)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            LTV por cuenta
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Facturado + proyección estimada (al TC más reciente).
          </p>
          {ltv.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos de LTV.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b [border-color:var(--glass-border)]">
                  <th className="py-1.5 text-left font-semibold text-muted-foreground">Cuenta</th>
                  <th className="py-1.5 text-right font-semibold text-muted-foreground">Facturado</th>
                  <th className="py-1.5 text-right font-semibold text-muted-foreground">Proyectado*</th>
                  <th className="py-1.5 text-right font-semibold text-muted-foreground">LTV</th>
                </tr>
              </thead>
              <tbody>
                {ltv.map((r) => (
                  <tr
                    key={r.accountId}
                    className="border-b last:border-0 [border-color:var(--glass-border)]"
                  >
                    <td className="py-1.5 font-medium">{r.accountName}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatArs(r.billedToDate)}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {formatArs(r.projectedArs)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{formatArs(r.ltv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            * Estimación: fee del período activo × meses restantes (o 12 si es
            indefinido), convertido al TC más reciente.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
