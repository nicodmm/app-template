"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  StickyNote,
  Paperclip,
  Presentation as PresentationIcon,
  FileSpreadsheet,
  Mic,
  Trash2,
  Download,
  RotateCcw,
} from "lucide-react";
import { deleteTranscript, retryTranscript } from "@/app/actions/transcripts";
import { deleteContextDocument } from "@/app/actions/context-documents";
import type { Transcript } from "@/lib/drizzle/schema";
import type { ContextDocument } from "@/lib/queries/context-documents";

interface ContextFilesTimelineProps {
  transcripts: Transcript[];
  contextDocs: ContextDocument[];
  accountId: string;
}

type Item =
  | { kind: "transcript"; t: Transcript; createdAt: Date }
  | { kind: "context_doc"; d: ContextDocument; createdAt: Date };

const TRANSCRIPT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Procesada",
  failed: "Error",
  cancelled: "Cancelada",
};

const TRANSCRIPT_STATUS_CLASSES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-blue-200 text-blue-900 dark:bg-blue-800/50 dark:text-blue-200",
  completed: "bg-emerald-200 text-emerald-900 dark:bg-emerald-800/50 dark:text-emerald-200",
  failed: "bg-red-200 text-red-900 dark:bg-red-800/50 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground",
};

const DOC_TYPE_META: Record<string, { label: string; Icon: typeof FileText }> = {
  note: { label: "Nota", Icon: StickyNote },
  presentation: { label: "Presentación", Icon: PresentationIcon },
  report: { label: "Reporte", Icon: FileText },
  spreadsheet: { label: "Planilla", Icon: FileSpreadsheet },
  other: { label: "Archivo", Icon: Paperclip },
};

function downloadTranscript(t: Transcript) {
  const name =
    t.fileName ?? `Transcripcion-${new Date(t.createdAt).toISOString().split("T")[0]}`;
  const body = [
    `ARCHIVO: ${name}`,
    `FECHA: ${new Date(t.createdAt).toLocaleDateString("es-AR")}`,
    `PALABRAS: ${t.wordCount.toLocaleString()}`,
    "",
    t.content,
  ].join("\n");
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\.[^.]+$/, "")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ContextFilesTimeline({
  transcripts,
  contextDocs,
  accountId,
}: ContextFilesTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const items: Item[] = [
    ...transcripts.map<Item>((t) => ({
      kind: "transcript",
      t,
      createdAt: new Date(t.createdAt),
    })),
    ...contextDocs.map<Item>((d) => ({
      kind: "context_doc",
      d,
      createdAt: new Date(d.createdAt),
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay archivos de contexto.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        if (item.kind === "transcript") {
          const t = item.t;
          const statusLabel = TRANSCRIPT_STATUS_LABEL[t.status] ?? t.status;
          const statusClasses =
            TRANSCRIPT_STATUS_CLASSES[t.status] ?? TRANSCRIPT_STATUS_CLASSES.pending;
          return (
            <div
              key={`t-${t.id}`}
              className="rounded-lg border border-border bg-card p-3 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <Mic size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {t.fileName ?? (t.sourceType === "file" ? "Archivo" : "Transcripción pegada")}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Transcripción
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(t.createdAt).toLocaleDateString("es-AR")}
                    {t.wordCount > 0 && ` · ${t.wordCount.toLocaleString()} palabras`}
                  </p>
                  {t.errorMessage && (
                    <p className="text-xs text-destructive mt-1">{t.errorMessage}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(t.status === "failed" || t.status === "pending") && (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await retryTranscript(t.id);
                        router.refresh();
                      })
                    }
                    disabled={isPending}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                    title="Reintentar"
                  >
                    <RotateCcw size={12} />
                    Reintentar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadTranscript(t)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Descargar"
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("¿Eliminar esta transcripción?")) return;
                    startTransition(async () => {
                      await deleteTranscript(t.id, accountId);
                      router.refresh();
                    });
                  }}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        }

        const d = item.d;
        const meta = DOC_TYPE_META[d.docType] ?? DOC_TYPE_META.other;
        const { Icon, label } = meta;
        const isOpen = expanded === d.id;
        const hasBody = !!(d.notes || d.extractedText);

        return (
          <div key={`d-${d.id}`} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => hasBody && setExpanded(isOpen ? null : d.id)}
                className={`flex items-start gap-2 text-left flex-1 min-w-0 ${
                  hasBody ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <Icon size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{d.title}</span>
                    <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(d.createdAt).toLocaleDateString("es-AR", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {d.fileName && d.fileName !== d.title && ` · ${d.fileName}`}
                    {d.fileSize ? ` · ${Math.round(d.fileSize / 1024)} KB` : ""}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Eliminar "${d.title}"?`)) return;
                  startTransition(async () => {
                    await deleteContextDocument(d.id);
                    router.refresh();
                  });
                }}
                disabled={isPending}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label="Eliminar"
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isOpen && hasBody && (
              <div className="mt-3 pt-3 border-t border-border">
                {d.notes && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{d.notes}</p>
                )}
                {d.extractedText && (
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      Ver texto extraído ({d.extractedText.length.toLocaleString()} caracteres)
                    </summary>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {d.extractedText}
                    </p>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
