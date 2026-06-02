"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Briefcase, Users, Clock, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { SearchFormDialog, type EditSearchData } from "@/components/selection/search-form-dialog";
import type { SearchWithCounts } from "@/lib/queries/selection";
import { cn } from "@/lib/utils";

type DialogState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; search: EditSearchData };

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  closed: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  paused: "Pausada",
  closed: "Cerrada",
};

interface Props {
  accountId: string;
  searches: SearchWithCounts[];
}

export function SearchList({ accountId, searches }: Props) {
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  function openCreate() {
    setDialog({ open: true, mode: "create" });
  }

  function openEdit(search: SearchWithCounts) {
    setDialog({
      open: true,
      mode: "edit",
      search: {
        id: search.id,
        position: search.position,
        positionDescription: null, // not available from list query
        status: search.status,
        razonSocial: search.razonSocial,
        cuit: search.cuit,
      },
    });
  }

  function closeDialog() {
    setDialog({ open: false });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">
          {searches.length === 0
            ? "Sin búsquedas"
            : `${searches.length} búsqueda${searches.length !== 1 ? "s" : ""}`}
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} aria-hidden />
          Nueva búsqueda
        </button>
      </div>

      {/* Empty state */}
      {searches.length === 0 && (
        <GlassCard className="p-10 flex flex-col items-center justify-center gap-3 text-center">
          <Briefcase size={32} className="text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            No hay búsquedas para esta cuenta.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} aria-hidden />
            Crear primera búsqueda
          </button>
        </GlassCard>
      )}

      {/* Grid */}
      {searches.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {searches.map((search) => (
            <div key={search.id} className="relative group">
              <GlassCard className="p-5 flex flex-col gap-3 h-full hover:[background:var(--glass-bg-strong)] transition-all">
                {/* Card link — whole body navigates to candidates view */}
                <Link
                  href={`/app/accounts/${accountId}/selection/${search.id}`}
                  className="absolute inset-0 rounded-xl"
                  aria-label={`Ver candidatos de ${search.position}`}
                />

                {/* Header row: title + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">
                    {search.position}
                  </h3>
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_STYLE[search.status] ?? STATUS_STYLE.closed
                    )}
                  >
                    {STATUS_LABEL[search.status] ?? search.status}
                  </span>
                </div>

                {/* Razón social */}
                {search.razonSocial && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {search.razonSocial}
                    {search.cuit && <> · {search.cuit}</>}
                  </p>
                )}

                {/* Counts */}
                <div className="flex items-center gap-4 mt-auto pt-2 [border-top:1px_solid_var(--glass-border)]">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users size={12} aria-hidden />
                    {search.candidateCount} candidato{search.candidateCount !== 1 ? "s" : ""}
                  </span>
                  {search.pendingCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <Clock size={12} aria-hidden />
                      {search.pendingCount} pendiente{search.pendingCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  <ChevronRight size={12} className="ml-auto text-muted-foreground opacity-50" aria-hidden />
                </div>
              </GlassCard>

              {/* Edit button — sits above the card link via z-index */}
              <button
                type="button"
                onClick={() => openEdit(search)}
                className="absolute top-3 right-3 z-10 rounded-md p-1.5 text-muted-foreground bg-background/60 hover:bg-accent hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Editar ${search.position}`}
                // Prevent the Link from capturing this click
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Pencil size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      {dialog.open && dialog.mode === "create" && (
        <SearchFormDialog
          accountId={accountId}
          open
          onClose={closeDialog}
          dialogMode={{ mode: "create" }}
        />
      )}
      {dialog.open && dialog.mode === "edit" && (
        <SearchFormDialog
          accountId={accountId}
          open
          onClose={closeDialog}
          dialogMode={{ mode: "edit", search: dialog.search }}
        />
      )}
    </>
  );
}
