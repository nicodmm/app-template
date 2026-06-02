"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectionCandidate, SelectionSearch } from "@/lib/drizzle/schema";
import { CandidateListPanel } from "@/components/selection/candidate-list-panel";
import { CandidateDetailPanel } from "@/components/selection/candidate-detail-panel";
import { CandidateFormDialog } from "@/components/selection/candidate-form-dialog";

interface Props {
  accountId: string;
  searchId: string;
  search: SelectionSearch;
  candidates: SelectionCandidate[];
}

interface MetricChip {
  label: string;
  status: string;
  color: string;
}

const METRIC_CHIPS: MetricChip[] = [
  { label: "Pendientes", status: "pending", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { label: "Avanza", status: "advance", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { label: "Oferta", status: "offer", color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { label: "Descartados", status: "rejected", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
];

export function CandidateWorkspace({ accountId, searchId, search, candidates }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(
    candidates[0]?.id ?? null
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const selectedCandidate = candidates.find((c) => c.id === selectedId) ?? null;

  function handleCreated(): void {
    router.refresh();
    setDialogOpen(false);
  }

  return (
    <>
      {/* Top bar: metrics + add button */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground mr-1">
            <Users size={14} aria-hidden />
            {candidates.length} candidato{candidates.length !== 1 ? "s" : ""}
          </span>
          {METRIC_CHIPS.map((chip) => {
            const count = candidates.filter((c) => c.status === chip.status).length;
            return (
              <span
                key={chip.status}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  chip.color
                )}
              >
                {chip.label}: {count}
              </span>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} aria-hidden />
          Agregar candidato
        </button>
      </div>

      {/* Split view */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        {/* Left: list */}
        <CandidateListPanel
          candidates={candidates}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {/* Right: detail or empty state */}
        {selectedCandidate ? (
          <CandidateDetailPanel
            accountId={accountId}
            searchId={searchId}
            candidate={selectedCandidate}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] backdrop-blur-[14px] p-10 text-center gap-3">
            <Users size={32} className="text-muted-foreground opacity-40" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {candidates.length === 0
                ? "Todavía no hay candidatos. Agregá el primero."
                : "Seleccioná un candidato para ver su detalle."}
            </p>
            {candidates.length === 0 && (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} aria-hidden />
                Agregar candidato
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <CandidateFormDialog
        accountId={accountId}
        searchId={searchId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode="create"
        onSuccess={handleCreated}
      />
    </>
  );
}
