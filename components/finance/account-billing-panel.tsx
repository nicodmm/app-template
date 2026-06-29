"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  setAccountBillingStatus,
  setBillingCentroCostos,
  addBillingCharge,
  deleteBillingCharge,
  generateBillingForMonth,
} from "@/app/actions/finance";
import type { BillingRow } from "@/lib/queries/finance";
import {
  BILLING_STATUS_ORDER,
  BILLING_STATUS_LABELS,
  CENTRO_COSTOS_ORDER,
  CENTRO_COSTOS_LABELS,
  type BillingStatus,
  type CentroCostos,
} from "@/lib/finance/billing-meta";

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
const arsFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const inputClass =
  "rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";
const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed";

interface Props {
  accountId: string;
  accountName: string;
  year: number;
  month: number;
  billing: BillingRow[];
  /** Estado de facturación de la cuenta para el mes (cuenta/mes). */
  status: BillingStatus;
}

export function AccountBillingPanel({
  accountId,
  year,
  month,
  billing,
  status,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCharge, setShowCharge] = useState(false);
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ARS");

  const totalArs = billing.reduce((s, r) => s + (r.amountArs ?? 0), 0);

  function nav(y: number, m: number) {
    router.push(`/app/finanzas/${accountId}?year=${y}&month=${m}`);
  }

  function handleAccountStatus(next: BillingStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setAccountBillingStatus({
        accountId,
        year,
        month,
        status: next,
      });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  function handleCentro(id: string, value: string) {
    setError(null);
    const centroCostos = value === "" ? null : (value as CentroCostos);
    startTransition(async () => {
      const res = await setBillingCentroCostos({ id, centroCostos });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteBillingCharge({ id });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  function handleRegenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateBillingForMonth({ year, month });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!concept.trim()) {
      setError("Concepto requerido");
      return;
    }
    if (isNaN(amt)) {
      setError("Monto inválido");
      return;
    }
    startTransition(async () => {
      const res = await addBillingCharge({
        accountId,
        year,
        month,
        concept: concept.trim(),
        amount: amt,
        currency,
      });
      if (!res.success) {
        setError(res.error ?? "Error");
        return;
      }
      setConcept("");
      setAmount("");
      setShowCharge(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          A facturar — {MONTHS[month]} {year}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={month}
            disabled={isPending}
            onChange={(e) => nav(year, parseInt(e.target.value, 10))}
            className={`${inputClass} w-[130px]`}
            aria-label="Mes"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {MONTHS[m]}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={year}
            min={2000}
            max={2100}
            disabled={isPending}
            onChange={(e) => nav(parseInt(e.target.value, 10) || year, month)}
            className={`${inputClass} w-[80px]`}
            aria-label="Año"
          />
          <button
            type="button"
            onClick={() => setShowCharge((v) => !v)}
            disabled={isPending}
            className={ghostBtn}
          >
            <Plus size={13} aria-hidden /> Agregar cargo
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isPending}
            className={ghostBtn}
          >
            <RefreshCw size={13} aria-hidden /> Regenerar
          </button>
        </div>
      </div>

      {/* Estado de la factura (cuenta/mes) */}
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-muted-foreground">
          Estado de la factura
        </label>
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => handleAccountStatus(e.target.value as BillingStatus)}
          className={inputClass}
          aria-label="Estado de la factura"
        >
          {BILLING_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {BILLING_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {showCharge && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Concepto"
            disabled={isPending}
            className={`${inputClass} min-w-[160px]`}
          />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            placeholder="Monto"
            disabled={isPending}
            className={`${inputClass} w-[110px]`}
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={isPending}
            className={inputClass}
            aria-label="Moneda"
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
          <button type="submit" disabled={isPending} className={ghostBtn}>
            <Plus size={13} aria-hidden /> Agregar
          </button>
        </form>
      )}

      {billing.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin filas este mes.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b [border-color:var(--glass-border)]">
              <th className="py-2 text-left font-semibold text-muted-foreground">
                Concepto
              </th>
              <th className="py-2 text-right font-semibold text-muted-foreground">
                Original
              </th>
              <th className="py-2 text-right font-semibold text-muted-foreground">
                ARS
              </th>
              <th className="py-2 text-left font-semibold text-muted-foreground">
                Centro de costos
              </th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {billing.map((r) => (
              <tr
                key={r.id}
                className="border-b last:border-0 [border-color:var(--glass-border)]"
              >
                <td className="py-2">
                  {r.concept}
                  {r.isAdditional && (
                    <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary">
                      adicional
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.amountOriginal.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  {r.currencyOriginal}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.amountArs != null ? (
                    arsFmt.format(r.amountArs)
                  ) : r.billingRule === "same" ? (
                    <span
                      className="text-muted-foreground"
                      title={`Se factura en ${r.currencyOriginal}, sin conversión a ARS`}
                    >
                      Factura en {r.currencyOriginal}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={11} aria-hidden /> TC pendiente
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <select
                    value={r.centroCostos ?? ""}
                    disabled={isPending}
                    onChange={(e) => handleCentro(r.id, e.target.value)}
                    className={inputClass}
                    aria-label="Centro de costos"
                  >
                    <option value="">— Sin asignar</option>
                    {CENTRO_COSTOS_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CENTRO_COSTOS_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-right">
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
              <td className="py-2 font-semibold" colSpan={2}>
                Total ARS
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {arsFmt.format(totalArs)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
