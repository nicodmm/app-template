"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { ProyeccionChart } from "@/components/finance/proyeccion-chart";
import { upsertProjectionAssumptions } from "@/app/actions/finance";
import {
  computeProjection,
  buildMepResolver,
  type PortfolioRow,
  type Assumptions,
  type Estado,
} from "@/lib/finance/projection-model";

interface KnownFxRow {
  year: number;
  month: number;
  mepRate: number;
  ipcCoefficient: number;
}

interface Props {
  portfolio: PortfolioRow[];
  assumptions: Assumptions;
  rates: KnownFxRow[];
  baseYear: number;
  baseMonth: number;
}

const NEURONAS = ["IC", "Growth", "Marketing", "Innovación", "People", "Growth/Mkt", "Otro"];
const ESTADOS: Estado[] = ["Activo", "En riesgo", "Se va"];

const fmtUsd = (n: number) =>
  (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-AR");

export function CarteraProyeccion({ portfolio, assumptions, rates, baseYear, baseMonth }: Props) {
  const [rows, setRows] = useState<PortfolioRow[]>(portfolio);
  const [a, setA] = useState<Assumptions>(assumptions);
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string>("");

  const mepResolver = useMemo(() => buildMepResolver(rates), [rates]);

  const R = useMemo(
    () => computeProjection(rows, a, baseYear, baseMonth),
    [rows, a, baseYear, baseMonth]
  );

  // Convert a USD figure for the base month / a projected month to display currency.
  const toDisplay = (usd: number, key: string | null): number => {
    if (currency === "USD") return usd;
    let mep: number | null;
    if (key) {
      const y = parseInt(key.slice(0, 4), 10);
      const m = parseInt(key.slice(5, 7), 10);
      mep = mepResolver(y, m);
    } else {
      mep = mepResolver(baseYear, baseMonth);
    }
    return mep ? usd * mep : usd;
  };

  const fmt = currency === "USD" ? fmtUsd : (n: number) => fmtUsd(n); // same formatter, ARS shown as plain pesos

  const chartValues = R.mrrUsd.map((v, i) => toDisplay(v, R.months[i].key));
  const chartBreakeven = toDisplay(R.breakevenUsd, null);

  const mrrNowDisp = toDisplay(R.mrrNowUsd, null);
  const ticketMedioDisp = toDisplay(R.ticketMedioUsd, null);
  const gapDisp = mrrNowDisp - chartBreakeven;
  const endUsd = R.mrrUsd[R.mrrUsd.length - 1] ?? 0;
  const endDisp = toDisplay(endUsd, R.months[R.months.length - 1]?.key ?? null);
  const ebitda = endDisp - chartBreakeven;

  const setAssum = (k: keyof Assumptions, v: number) =>
    setA((prev) => ({ ...prev, [k]: v }));

  const updRow = (i: number, k: keyof PortfolioRow, v: string) =>
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        switch (k) {
          case "ticketUsd":
            return { ...r, ticketUsd: Number(v) || 0 };
          case "bajaMonth":
            return { ...r, bajaMonth: v ? v : null };
          case "name":
            return { ...r, name: v };
          case "neurona":
            return { ...r, neurona: v };
          case "estado":
            return { ...r, estado: v as Estado };
          default:
            return r;
        }
      })
    );

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { accountId: "", name: "", neurona: "IC", ticketUsd: 0, estado: "Activo", bajaMonth: null },
    ]);
  const delRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const restore = () => setRows(portfolio);

  const save = () =>
    startTransition(async () => {
      const res = await upsertProjectionAssumptions(a);
      setSaved(res.success ? "Guardado ✓" : res.error ?? "Error");
      setTimeout(() => setSaved(""), 2500);
    });

  const cardCls = "rounded-xl border border-border/60 bg-card/40 p-4";
  const inputCls =
    "w-full rounded-md border border-border/60 bg-background px-2.5 py-2 text-sm tabular-nums outline-none focus:border-primary";
  const labelCls = "mb-1.5 block text-[11px] uppercase tracking-wide text-muted-foreground";

  return (
    <div className="space-y-8">
      {/* ① Supuestos */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Supuestos de proyección</h2>
          <p className="text-sm text-muted-foreground">
            Estos diales gobiernan el crecimiento por encima de tu cartera. Las bajas se definen
            cliente por cliente en la tabla.
          </p>
        </div>
        <div className={cardCls}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className={labelCls}>Breakeven (USD/mes)</label>
              <input className={inputCls} type="number" value={a.breakevenUsd}
                onChange={(e) => setAssum("breakevenUsd", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Otros ingresos rec. (USD)</label>
              <input className={inputCls} type="number" value={a.otrosIngresosUsd}
                onChange={(e) => setAssum("otrosIngresosUsd", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Clientes nuevos / mes</label>
              <input className={inputCls} type="number" value={a.clientesNuevosMes}
                onChange={(e) => setAssum("clientesNuevosMes", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Ticket medio nuevo (USD)</label>
              <input className={inputCls} type="number" value={a.ticketMedioNuevoUsd}
                onChange={(e) => setAssum("ticketMedioNuevoUsd", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Churn adicional (USD/mes)</label>
              <input className={inputCls} type="number" value={a.churnUsdMes}
                onChange={(e) => setAssum("churnUsdMes", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Horizonte</label>
              <div className="inline-flex w-full overflow-hidden rounded-md border border-border/60">
                {[6, 18].map((h) => (
                  <button key={h} type="button"
                    onClick={() => setAssum("horizonteMeses", h)}
                    className={cn(
                      "flex-1 px-2 py-2 text-xs font-medium transition-colors",
                      a.horizonteMeses === h
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}>
                    {h === 6 ? "H2 2026" : "hasta dic-27"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={save} disabled={pending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {pending ? "Guardando…" : "Guardar supuestos"}
            </button>
            <span className="text-xs text-muted-foreground">{saved}</span>
          </div>
        </div>
      </section>

      {/* ② Resultado */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Resultado</h2>
          <div className="inline-flex overflow-hidden rounded-md border border-border/60">
            {(["USD", "ARS"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  currency === c ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"
                )}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className={cardCls}>
          <ProyeccionChart labels={R.months.map((m) => m.label)} values={chartValues} breakeven={chartBreakeven} fmt={fmt} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi label={`MRR hoy (${currency})`} value={fmt(mrrNowDisp)} meta="cartera + otros"
            tone={mrrNowDisp >= chartBreakeven ? "pos" : "neg"} />
          <Kpi label="Clientes activos" value={String(R.count)} meta="en cartera" />
          <Kpi label="Ticket medio" value={fmt(ticketMedioDisp)} meta="MRR ÷ clientes" tone="gold" />
          <Kpi label="Gap a breakeven" value={(gapDisp >= 0 ? "+" : "") + fmt(gapDisp)} meta="MRR − breakeven"
            tone={gapDisp >= 0 ? "pos" : "neg"} />
          <Kpi label="Cruza breakeven"
            value={mrrNowDisp >= chartBreakeven ? "Ya" : R.crossLabel ?? "No en rango"}
            meta="primer mes ≥ BE"
            tone={mrrNowDisp >= chartBreakeven || R.crossLabel ? "pos" : "neg"} />
          <Kpi label="MRR fin horizonte" value={fmt(endDisp)}
            meta={`EBITDA ${ebitda >= 0 ? "+" : ""}${fmt(ebitda)}/mes`}
            tone={endDisp >= chartBreakeven ? "pos" : "neg"} />
        </div>
      </section>

      {/* ③ Cartera */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Cartera de clientes</h2>
            <p className="text-sm text-muted-foreground">
              Datos reales de tus cuentas. Editá para simular escenarios — no modifica las cuentas.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addRow}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              + Agregar
            </button>
            <button type="button" onClick={restore}
              className="rounded-md border border-border/60 px-3 py-1.5 text-sm hover:border-primary">
              ↺ Restaurar desde cuentas
            </button>
          </div>
        </div>
        <div className={cardCls}>
          <div className="mb-2 text-sm text-muted-foreground">
            {R.count} clientes · MRR cartera{" "}
            <b className="text-foreground">{fmt(toDisplay(R.baseNowUsd, null))}</b>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Cliente</th>
                  <th className="pb-2 pr-2 font-medium">Neurona</th>
                  <th className="pb-2 pr-2 font-medium">Ticket USD/mes</th>
                  <th className="pb-2 pr-2 font-medium">Estado</th>
                  <th className="pb-2 pr-2 font-medium">Mes de baja</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.accountId}-${i}`} className="border-t border-border/50">
                    <td className="py-1 pr-2">
                      <input className={inputCls} value={r.name} onChange={(e) => updRow(i, "name", e.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <select className={inputCls} value={r.neurona} onChange={(e) => updRow(i, "neurona", e.target.value)}>
                        {NEURONAS.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                        {!NEURONAS.includes(r.neurona) && <option value={r.neurona}>{r.neurona}</option>}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input className={cn(inputCls, "text-right")} type="number" value={r.ticketUsd}
                        onChange={(e) => updRow(i, "ticketUsd", e.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <select className={inputCls} value={r.estado} onChange={(e) => updRow(i, "estado", e.target.value)}>
                        {ESTADOS.map((es) => (
                          <option key={es} value={es}>{es}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input className={inputCls} placeholder="YYYY-MM" value={r.bajaMonth ?? ""}
                        onChange={(e) => updRow(i, "bajaMonth", e.target.value.trim() || "")} />
                    </td>
                    <td className="py-1 text-right">
                      <button type="button" onClick={() => delRow(i)}
                        className="px-2 text-muted-foreground hover:text-destructive">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          El cliente factura hasta su mes de baja inclusive y desaparece después. ARS usa el MEP del mes
          (e IPC para meses futuros). Herramienta de decisión, no asesoramiento financiero formal.
        </p>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "pos" | "neg" | "gold";
}) {
  const toneCls =
    tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-rose-500" : tone === "gold" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{meta}</div>
    </div>
  );
}
