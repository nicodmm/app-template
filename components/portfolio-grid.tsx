"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Search, Trash2, X } from "lucide-react";
import { AccountCard } from "@/components/account-card";
import { bulkSetAccountStatus, bulkDeleteAccounts } from "@/app/actions/accounts";
import type { AccountWithOwner } from "@/lib/queries/accounts";
import type { AccountStatus } from "@/lib/accounts/status";

type SortBy = "alpha" | "health";

export function PortfolioGrid({ accounts }: { accounts: AccountWithOwner[] }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("alpha");

  // `accounts` ya viene ordenado por salud desde el server; para "Por salud"
  // conservamos ese orden, y para "alpha" ordenamos por nombre.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? accounts.filter((a) => a.name.toLowerCase().includes(q))
      : accounts;
    if (sortBy === "alpha") {
      return [...filtered].sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      );
    }
    return filtered;
  }, [accounts, query, sortBy]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }
  function selectAll() {
    setSelected(new Set(visible.map((a) => a.id)));
  }

  function applyStatus(status: AccountStatus) {
    if (selected.size === 0) return;
    startTransition(async () => {
      await bulkSetAccountStatus(Array.from(selected), status);
      exitSelect();
      router.refresh();
    });
  }
  function remove() {
    if (selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} cuenta(s)? Es irreversible.`)) return;
    startTransition(async () => {
      await bulkDeleteAccounts(Array.from(selected));
      exitSelect();
      router.refresh();
    });
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-accent/50 disabled:opacity-50";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cuenta…"
            aria-label="Buscar cuenta"
            className="w-full rounded-md py-1.5 pl-8 pr-3 text-sm bg-transparent [border:1px_solid_var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Ordenar cuentas"
          className="rounded-md px-2 py-1.5 text-xs bg-transparent [border:1px_solid_var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="alpha">Orden: A → Z</option>
          <option value="health">Orden: por salud</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          {selecting ? (
            <>
              <button type="button" onClick={exitSelect} className={btn}>
                <X size={14} aria-hidden /> Cancelar
              </button>
              <button type="button" onClick={selectAll} className={btn}>
                Seleccionar todas
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setSelecting(true)} className={btn}>
              <CheckSquare size={14} aria-hidden /> Seleccionar
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No hay cuentas que coincidan con “{query}”.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              selectable={selecting}
              selected={selected.has(a.id)}
              onToggle={toggle}
            />
          ))}
        </div>
      )}

      {selecting && selected.size > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 backdrop-blur-[16px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
          </span>
          <select
            disabled={pending}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value as AccountStatus | "";
              e.currentTarget.value = "";
              if (v) applyStatus(v);
            }}
            className="rounded-md px-2 py-1.5 text-xs bg-transparent [border:1px_solid_var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            <option value="">Cambiar estado…</option>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
            <option value="finished">Finalizado</option>
          </select>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} aria-hidden /> Eliminar
          </button>
        </div>
      )}
    </>
  );
}
