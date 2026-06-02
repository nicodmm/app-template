"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Pencil, Sparkles } from "lucide-react";
import { generateCandidateReport, saveCandidateReport } from "@/app/actions/selection";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import type { SelectionCandidate } from "@/lib/drizzle/schema";

interface Props {
  accountId: string;
  searchId: string;
  candidate: SelectionCandidate;
}

const STATUS_TEXT: Record<string, string> = {
  none: "No generado",
  generating: "Generando…",
  ready: "Listo",
  error: "Error",
};

const STATUS_STYLE: Record<string, string> = {
  none: "bg-muted text-muted-foreground",
  generating: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  error: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function ReportEditor({ accountId, searchId, candidate }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(candidate.reportContent ?? "");

  const status = candidate.reportStatus ?? "none";
  const isGenerating = status === "generating";

  function handleGenerate(): void {
    setError(null);
    startTransition(async () => {
      const result = await generateCandidateReport({
        accountId,
        searchId,
        candidateId: candidate.id,
      });
      if (!result.success) {
        setError(result.error ?? "Error al generar el informe");
        return;
      }
      router.refresh();
    });
  }

  function handleSave(): void {
    setError(null);
    startTransition(async () => {
      const result = await saveCandidateReport({
        accountId,
        searchId,
        candidateId: candidate.id,
        reportContent: draft,
      });
      if (!result.success) {
        setError(result.error ?? "Error al guardar el informe");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <GlassCard className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Informe</h3>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            STATUS_STYLE[status] ?? STATUS_STYLE.none
          )}
        >
          {STATUS_TEXT[status] ?? status}
        </span>
      </div>

      {status === "error" && candidate.reportError && (
        <p className="text-xs text-destructive">{candidate.reportError}</p>
      )}

      {!editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending || isGenerating}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={14} aria-hidden />
            )}
            {isGenerating ? "Generando…" : "Generar informe"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(candidate.reportContent ?? "");
              setEditing(true);
            }}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <Pencil size={14} aria-hidden />
            Editar informe
          </button>
        </div>
      )}

      {editing && (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            placeholder="Contenido del informe (markdown)…"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </GlassCard>
  );
}
