"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Save } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { setMemberCompensation, deleteMemberCompensation } from "@/app/actions/finance";
import type { CompensationRow } from "@/lib/queries/finance";

interface Props {
  rows: CompensationRow[];
  members: Array<{ userId: string; name: string }>;
}

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed";

const dangerBtn =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed";

const inputClass =
  "rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 w-full";

const CURRENCIES = ["ARS", "USD"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CompensationEditor({ rows, members }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [userId, setUserId] = useState<string>(members[0]?.userId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("ARS");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(todayISO());
  const [effectiveTo, setEffectiveTo] = useState<string>("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (!userId) {
      setError("Seleccioná un consultor");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Monto inválido");
      return;
    }
    if (!effectiveFrom) {
      setError("Fecha de inicio requerida");
      return;
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      setError("La fecha de fin debe ser posterior al inicio");
      return;
    }

    startTransition(async () => {
      const res = await setMemberCompensation({
        userId,
        amount: parsedAmount,
        currency,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      });
      if (!res.success) {
        setError(res.error ?? "Error al guardar");
        return;
      }
      setAmount("");
      setEffectiveFrom(todayISO());
      setEffectiveTo("");
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteMemberCompensation({ id });
      setDeletingId(null);
      if (!res.success) {
        setError(res.error ?? "Error al eliminar");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Compensaciones fijas de consultores
      </h3>

      {/* Add form */}
      <GlassCard className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">
          Agregar nueva compensación
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          {/* Member select */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-[11px] text-muted-foreground">Consultor</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={isPending || members.length === 0}
              required
              className={inputClass}
            >
              {members.length === 0 ? (
                <option value="">Sin miembros</option>
              ) : (
                members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-[11px] text-muted-foreground">Monto</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="150000"
              min={0}
              step="0.01"
              required
              disabled={isPending}
              className={inputClass}
            />
          </div>

          {/* Currency */}
          <div className="flex flex-col gap-1 min-w-[80px]">
            <label className="text-[11px] text-muted-foreground">Moneda</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={isPending}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Effective from */}
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-[11px] text-muted-foreground">Vigencia desde</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              required
              disabled={isPending}
              className={inputClass}
            />
          </div>

          {/* Effective to (optional) */}
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-[11px] text-muted-foreground">Vigencia hasta (opcional)</label>
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
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

      {/* Existing rows table */}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin compensaciones cargadas aún.</p>
      ) : (
        <GlassCard className="overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b [border-color:var(--glass-border)]">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                  Consultor
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                  Monto
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                  Moneda
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                  Desde
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                  Hasta
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 [border-color:var(--glass-border)] hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-2 font-medium">{r.userName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.amount.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-2">{r.currency}</td>
                  <td className="px-4 py-2 tabular-nums">{r.effectiveFrom}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">
                    {r.effectiveTo ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={isPending && deletingId === r.id}
                      className={dangerBtn}
                      aria-label="Eliminar"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
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
