"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ExternalLink,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { deleteCandidate, saveRecruiterNotes } from "@/app/actions/selection";
import { CandidateFormDialog } from "@/components/selection/candidate-form-dialog";
import { CvUploader } from "@/components/selection/cv-uploader";
import { DocumentViewer } from "@/components/selection/document-viewer";
import { ReportEditor } from "@/components/selection/report-editor";
import type { SelectionCandidate } from "@/lib/drizzle/schema";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  advance: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  offer: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  advance: "Avanza",
  offer: "Oferta",
  rejected: "Descartado",
};

/** Fecha de carga en formato dd/mm/aaaa (sin hora). */
function formatLoadDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface Props {
  accountId: string;
  searchId: string;
  candidate: SelectionCandidate;
}

export function CandidateDetailPanel({ accountId, searchId, candidate }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [notes, setNotes] = useState(candidate.recruiterNotes ?? "");
  const [isSavingNotes, startSaveNotes] = useTransition();
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);

  const statusStyle = STATUS_STYLE[candidate.status] ?? STATUS_STYLE.pending;
  const statusLabel = STATUS_LABEL[candidate.status] ?? candidate.status;

  function handleDelete(): void {
    if (!window.confirm("¿Eliminar este candidato? Esta acción no se puede deshacer.")) {
      return;
    }
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteCandidate({
        accountId,
        searchId,
        candidateId: candidate.id,
      });
      if (!result.success) {
        setDeleteError(result.error ?? "Error al eliminar");
        return;
      }
      router.refresh();
    });
  }

  function handleSaveNotes(): void {
    setNotesError(null);
    setNotesSaved(false);
    startSaveNotes(async () => {
      const result = await saveRecruiterNotes({
        accountId,
        searchId,
        candidateId: candidate.id,
        recruiterNotes: notes,
      });
      if (!result.success) {
        setNotesError(result.error ?? "Error al guardar las notas");
        return;
      }
      setNotesSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 1 — Header */}
      <GlassCard className="p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold leading-tight">
              {candidate.firstName} {candidate.lastName}
            </h2>
            <span className="text-xs text-muted-foreground">
              Cargado {formatLoadDate(candidate.createdAt)}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Pencil size={14} aria-hidden />
              Editar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-destructive shadow-sm hover:bg-destructive/10 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden />
              {isDeleting ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </div>

        {/* Key data inline */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {candidate.email && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Mail size={14} aria-hidden />
              <span className="text-foreground">{candidate.email}</span>
            </span>
          )}
          {candidate.phone && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Phone size={14} aria-hidden />
              <span className="text-foreground">{candidate.phone}</span>
            </span>
          )}
          {candidate.linkedinUrl && (
            <a
              href={candidate.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              LinkedIn
              <ExternalLink size={12} aria-hidden />
            </a>
          )}
          {candidate.expectedSalary && (
            <span className="text-muted-foreground">
              Rem. pretendida:{" "}
              <span className="text-foreground font-medium">{candidate.expectedSalary}</span>
            </span>
          )}
          {candidate.currentSalary && (
            <span className="text-muted-foreground">
              Rem. actual:{" "}
              <span className="text-foreground font-medium">{candidate.currentSalary}</span>
            </span>
          )}
        </div>

        {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
      </GlassCard>

      {/* 2 — Decisión / estado del cliente (read-only) */}
      <GlassCard className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Decisión del cliente</h3>
        </div>
        <p className="text-sm">
          Estado:{" "}
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              statusStyle
            )}
          >
            {statusLabel}
          </span>
        </p>
        {candidate.status === "advance" && (candidate.interviewModality || candidate.interviewSchedule) && (
          <div className="text-sm text-muted-foreground flex flex-col gap-1">
            {candidate.interviewModality && (
              <span>
                Modalidad:{" "}
                <span className="text-foreground">{candidate.interviewModality}</span>
              </span>
            )}
            {candidate.interviewSchedule && (
              <span>
                Disponibilidad:{" "}
                <span className="text-foreground">{candidate.interviewSchedule}</span>
              </span>
            )}
          </div>
        )}
        {candidate.status === "offer" && candidate.offerConditions && (
          <p className="text-sm text-muted-foreground">
            Condiciones de oferta:{" "}
            <span className="text-foreground">{candidate.offerConditions}</span>
          </p>
        )}
        {candidate.status === "rejected" && candidate.rejectionReason && (
          <p className="text-sm text-muted-foreground">
            Motivo de descarte:{" "}
            <span className="text-foreground">{candidate.rejectionReason}</span>
          </p>
        )}
        {candidate.status === "pending" && (
          <p className="text-sm text-muted-foreground">
            El cliente aún no tomó una decisión.
          </p>
        )}
      </GlassCard>

      {/* 3 — Centerpiece: CV / Informe */}
      <DocumentViewer accountId={accountId} candidate={candidate} />

      {/* 4 — Admin tools */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CvUploader accountId={accountId} searchId={searchId} candidate={candidate} />
        <ReportEditor accountId={accountId} searchId={searchId} candidate={candidate} />
      </div>

      {/* 5 — Notas del reclutador */}
      <GlassCard className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Notas del reclutador</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Estas notas alimentan la generación del informe.
        </p>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesSaved(false);
          }}
          rows={5}
          placeholder="Observaciones internas sobre el candidato…"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-end gap-3">
          {notesSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Guardado</span>}
          {notesError && <span className="text-xs text-destructive">{notesError}</span>}
          <button
            type="button"
            onClick={handleSaveNotes}
            disabled={isSavingNotes}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            {isSavingNotes ? "Guardando…" : "Guardar notas"}
          </button>
        </div>
      </GlassCard>

      {/* 6 — Feedback del cliente (read-only) */}
      <GlassCard className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Feedback del cliente</h3>
        </div>
        {candidate.clientRating > 0 || candidate.clientNotes ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1" aria-label={`${candidate.clientRating} de 5 estrellas`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={16}
                  className={cn(
                    i < candidate.clientRating
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40"
                  )}
                  aria-hidden
                />
              ))}
            </div>
            {candidate.clientNotes && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {candidate.clientNotes}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            El cliente aún no dejó feedback.
          </p>
        )}
      </GlassCard>

      {/* Edit dialog */}
      <CandidateFormDialog
        accountId={accountId}
        searchId={searchId}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        candidate={candidate}
      />
    </div>
  );
}
