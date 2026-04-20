// components/crm-deals-tab.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CrmDealListRow, CrmFilterOptions } from "@/lib/queries/crm";

interface Props {
  filterOptions: CrmFilterOptions;
  dealPage: { deals: CrmDealListRow[]; totalPages: number };
  page: number;
  status: "open" | "won" | "all";
  sourceIds: string[];
  stageIds: string[];
}

function fmtValue(value: number | null, currency: string | null): string {
  if (value === null || !currency) return "—";
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("es-AR")}`;
  }
}

export function CrmDealsTab({ filterOptions, dealPage, page, status, sourceIds, stageIds }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(partial: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(partial)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select
          value={status}
          onChange={(e) => update({ status: e.target.value === "all" ? null : e.target.value, page: null })}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        >
          <option value="all">Todos</option>
          <option value="open">Abiertos</option>
          <option value="won">Ganados</option>
        </select>

        <MultiSelect
          label="Fuente"
          options={filterOptions.sources.map((s) => ({ value: s.externalId, label: s.name }))}
          selected={sourceIds}
          onChange={(next) => update({ source: next.join(",") || null, page: null })}
        />

        <MultiSelect
          label="Stage"
          options={filterOptions.stages.map((s) => ({ value: s.id, label: s.name }))}
          selected={stageIds}
          onChange={(next) => update({ stage: next.join(",") || null, page: null })}
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="py-2 px-3 font-normal">Título</th>
              <th className="py-2 px-3 font-normal">Fuente</th>
              <th className="py-2 px-3 font-normal">Stage</th>
              <th className="py-2 px-3 font-normal">Status</th>
              <th className="py-2 px-3 font-normal text-right">Valor</th>
              <th className="py-2 px-3 font-normal">Owner</th>
              <th className="py-2 px-3 font-normal">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {dealPage.deals.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 px-3 text-center text-muted-foreground">
                  No hay deals con estos filtros.
                </td>
              </tr>
            ) : (
              dealPage.deals.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-2 px-3 font-medium">{d.title}</td>
                  <td className="py-2 px-3">{d.sourceName}</td>
                  <td className="py-2 px-3">{d.stageName ?? "—"}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ${
                        d.status === "won" ? "bg-green-500/15 text-green-700" : "bg-blue-500/15 text-blue-700"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtValue(d.value, d.currency)}</td>
                  <td className="py-2 px-3">{d.ownerName ?? "—"}</td>
                  <td className="py-2 px-3">{new Date(d.addTime).toLocaleDateString("es-AR")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-muted-foreground">
          Página {page} de {dealPage.totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => update({ page: String(page - 1) })}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            disabled={page >= dealPage.totalPages}
            onClick={() => update({ page: String(page + 1) })}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next);
  }
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-xs">
        {label} {selected.length > 0 && `(${selected.length})`}
      </summary>
      <div className="absolute z-10 mt-1 max-h-60 w-60 overflow-auto rounded-md border border-border bg-popover p-2 shadow-lg">
        {options.length === 0 && <div className="text-xs text-muted-foreground">Sin opciones</div>}
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 py-0.5 text-xs">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}
