"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Loader2 } from "lucide-react";
import {
  extractTasksFromTranscript,
  extractTasksFromContextDoc,
} from "@/app/actions/extract-tasks";
import { importDriveLinkForAccount } from "@/app/actions/drive";
import type {
  ExtractTranscriptOption,
  ExtractContextDocOption,
} from "@/lib/queries/extract-sources";

type SourceTab = "meeting" | "document" | "link";

interface Props {
  accountId: string;
  transcripts: ExtractTranscriptOption[];
  contextDocs: ExtractContextDocOption[];
}

const DOC_TYPE_LABEL: Record<string, string> = {
  note: "Nota",
  presentation: "Presentación",
  report: "Reporte",
  spreadsheet: "Planilla",
  other: "Archivo",
};

function fmtDate(value: Date | string | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ExtractTasksDialog({ accountId, transcripts, contextDocs }: Props): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SourceTab>("meeting");

  const [transcriptId, setTranscriptId] = useState("");
  const [contextDocId, setContextDocId] = useState("");
  const [link, setLink] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function reset(): void {
    setMessage(null);
    setSubmitting(false);
  }

  function scheduleRefresh(): void {
    // El task corre en background; refrescamos el server component un par de
    // veces para que las tareas aparezcan cuando estén listas.
    setTimeout(() => router.refresh(), 6000);
    setTimeout(() => router.refresh(), 14000);
  }

  async function onSubmit(): Promise<void> {
    setSubmitting(true);
    setMessage(null);
    try {
      if (tab === "meeting") {
        if (!transcriptId) {
          setMessage({ kind: "error", text: "Elegí una reunión." });
          setSubmitting(false);
          return;
        }
        const res = await extractTasksFromTranscript(accountId, transcriptId);
        if (res.error) {
          setMessage({ kind: "error", text: res.error });
        } else {
          setMessage({ kind: "ok", text: "Extrayendo tareas… aparecerán en unos segundos." });
          scheduleRefresh();
        }
      } else if (tab === "document") {
        if (!contextDocId) {
          setMessage({ kind: "error", text: "Elegí un documento." });
          setSubmitting(false);
          return;
        }
        const res = await extractTasksFromContextDoc(accountId, contextDocId);
        if (res.error) {
          setMessage({ kind: "error", text: res.error });
        } else {
          setMessage({ kind: "ok", text: "Extrayendo tareas… aparecerán en unos segundos." });
          scheduleRefresh();
        }
      } else {
        if (!link.trim()) {
          setMessage({ kind: "error", text: "Pegá el link de la reunión." });
          setSubmitting(false);
          return;
        }
        const res = await importDriveLinkForAccount(accountId, link.trim());
        if (res.error) {
          setMessage({ kind: "error", text: res.error });
        } else if (res.outcome === "drive_not_connected") {
          setMessage({ kind: "error", text: "Conectá Google Drive primero desde la cuenta." });
        } else if (res.outcome === "duplicate") {
          setMessage({
            kind: "error",
            text: "Esa reunión ya estaba importada. Usá la pestaña 'Reunión de la cuenta' para re-extraerle tareas.",
          });
        } else if (res.outcome === "folder_bound") {
          setMessage({
            kind: "ok",
            text: `Vinculé la carpeta '${res.folderName ?? ""}'. Se importarán las reuniones y se extraerán tareas.`,
          });
          scheduleRefresh();
        } else {
          setMessage({
            kind: "ok",
            text: `Importando '${res.fileName ?? "la reunión"}' y extrayendo tareas…`,
          });
          scheduleRefresh();
        }
      }
    } catch {
      setMessage({ kind: "error", text: "No se pudo iniciar la extracción." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); reset(); }}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
      >
        <Sparkles size={14} /> Extraer tareas
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Extraer tareas de reunión</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Selector de fuente */}
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/30 p-1">
                {([
                  ["meeting", "Reunión"],
                  ["document", "Documento"],
                  ["link", "Link"],
                ] as [SourceTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setTab(key); setMessage(null); }}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      tab === key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "meeting" && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Reunión ya importada en la cuenta</label>
                  <select
                    value={transcriptId}
                    onChange={(e) => setTranscriptId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Elegí una reunión…</option>
                    {transcripts.map((t) => (
                      <option key={t.id} value={t.id}>
                        {(t.fileName ?? "Reunión sin nombre")} · {fmtDate(t.meetingDate ?? t.createdAt)}
                      </option>
                    ))}
                  </select>
                  {transcripts.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/70">Esta cuenta no tiene reuniones importadas.</p>
                  )}
                </div>
              )}

              {tab === "document" && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Documento de contexto de la cuenta</label>
                  <select
                    value={contextDocId}
                    onChange={(e) => setContextDocId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Elegí un documento…</option>
                    {contextDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        [{DOC_TYPE_LABEL[d.docType] ?? "Archivo"}] {d.title} · {fmtDate(d.createdAt)}
                      </option>
                    ))}
                  </select>
                  {contextDocs.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/70">Esta cuenta no tiene documentos de contexto.</p>
                  )}
                </div>
              )}

              {tab === "link" && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Link de Drive de la reunión</label>
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://drive.google.com/…"
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground/70">
                    Se importa la reunión a la cuenta y se extraen sus tareas.
                  </p>
                </div>
              )}

              {message && (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${
                    message.kind === "ok"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {message.text}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {submitting && <Loader2 size={13} className="animate-spin" />}
                  {tab === "link" ? "Importar y extraer" : "Extraer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
