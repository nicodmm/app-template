"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Download, RotateCcw, X, CheckSquare } from "lucide-react";
import { bulkDeleteTranscripts, deleteTranscript, retryTranscript } from "@/app/actions/transcripts";
import type { Transcript } from "@/lib/drizzle/schema";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Procesado",
  failed: "Error",
  cancelled: "Cancelado",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-blue-200 text-blue-900 dark:bg-blue-800/50 dark:text-blue-200",
  completed: "bg-emerald-200 text-emerald-900 dark:bg-emerald-800/50 dark:text-emerald-200",
  failed: "bg-red-200 text-red-900 dark:bg-red-800/50 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground",
};

interface TranscriptHistoryTableProps {
  transcripts: Transcript[];
  accountId: string;
}

function downloadAsText(selected: Transcript[]) {
  const separator = "\n" + "═".repeat(60) + "\n\n";
  const body = selected
    .map((t) => {
      const name =
        t.fileName ??
        `Transcripción — ${new Date(t.createdAt).toLocaleDateString("es-AR")}`;
      return [
        `ARCHIVO: ${name}`,
        `FECHA: ${new Date(t.createdAt).toLocaleDateString("es-AR")}`,
        `PALABRAS: ${t.wordCount.toLocaleString()}`,
        `ESTADO: ${STATUS_LABELS[t.status] ?? t.status}`,
        "",
        t.content,
      ].join("\n");
    })
    .join(separator);

  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    selected.length === 1
      ? `${selected[0].fileName?.replace(/\.[^.]+$/, "") ?? "transcripcion"}.txt`
      : `transcripciones-${new Date().toISOString().split("T")[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TranscriptHistoryTable({
  transcripts,
  accountId,
}: TranscriptHistoryTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const allIds = transcripts.map((t) => t.id);
  const allSelected = selected.size === allIds.length && allIds.length > 0;
  const someSelected = selected.size > 0;

  const retryableIds = transcripts
    .filter((t) => selected.has(t.id) && (t.status === "failed" || t.status === "pending"))
    .map((t) => t.id);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function handleBulkDelete() {
    if (!confirm(`¿Eliminar ${selected.size} transcripción${selected.size !== 1 ? "es" : ""}? Esta acción no se puede deshacer.`))
      return;
    startTransition(async () => {
      await bulkDeleteTranscripts([...selected], accountId);
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleBulkRetry() {
    startTransition(async () => {
      await Promise.all(retryableIds.map((id) => retryTranscript(id)));
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleBulkDownload() {
    const toDownload = transcripts.filter((t) => selected.has(t.id));
    downloadAsText(toDownload);
  }

  function handleSingleDelete(transcriptId: string) {
    if (!confirm("¿Eliminar esta transcripción?")) return;
    startTransition(async () => {
      await deleteTranscript(transcriptId, accountId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* Bulk toolbar */}
      {someSelected && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium text-primary">
            {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleBulkDownload}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              title="Descargar"
            >
              <Download size={13} />
              Descargar
            </button>
            {retryableIds.length > 0 && (
              <button
                onClick={handleBulkRetry}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                title="Reintentar"
              >
                <RotateCcw size={13} />
                Reintentar
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              title="Eliminar"
            >
              <Trash2 size={13} />
              Eliminar
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Deseleccionar todo"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-3 px-1 pb-1 border-b border-border">
        <button
          onClick={toggleAll}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title={allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
        >
          <CheckSquare size={15} className={allSelected ? "text-primary" : ""} />
        </button>
        <span className="text-xs text-muted-foreground font-medium">
          {transcripts.length} transcripción{transcripts.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Rows */}
      {transcripts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
            selected.has(t.id)
              ? "border-primary/40 bg-primary/5"
              : "border-border"
          }`}
        >
          <input
            type="checkbox"
            checked={selected.has(t.id)}
            onChange={() => toggleOne(t.id)}
            className="shrink-0 rounded border-border text-primary cursor-pointer"
          />

          <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  STATUS_CLASSES[t.status] ?? STATUS_CLASSES.pending
                }`}
              >
                {STATUS_LABELS[t.status] ?? t.status}
              </span>
              <div className="min-w-0">
                <p className="text-sm truncate">
                  {t.fileName ?? (t.sourceType === "file" ? "Archivo" : "Transcripción pegada")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleDateString("es-AR")}
                  {t.meetingDate && t.meetingDate !== new Date(t.createdAt).toISOString().split("T")[0] && (
                    <> · Reunión: {new Date(t.meetingDate + "T00:00:00").toLocaleDateString("es-AR")}</>
                  )}
                  {" · "}{t.wordCount.toLocaleString()} palabras
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(t.status === "failed" || t.status === "pending") && (
                <button
                  onClick={() => startTransition(() => retryTranscript(t.id).then(() => router.refresh()))}
                  disabled={isPending}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  Reintentar
                </button>
              )}
              <button
                onClick={() => downloadAsText([t])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Descargar"
              >
                <Download size={13} />
              </button>
              <button
                onClick={() => handleSingleDelete(t.id)}
                disabled={isPending}
                className="text-xs text-destructive hover:underline disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
