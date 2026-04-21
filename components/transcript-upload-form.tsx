"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadTranscript } from "@/app/actions/transcripts";
import { TranscriptProgress } from "@/components/transcript-progress";
import { Upload, FileText, AlertCircle, X, Loader2 } from "lucide-react";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

interface TranscriptUploadFormProps {
  accountId: string;
}

type FileStatus =
  | { phase: "queued" }
  | { phase: "uploading" }
  | { phase: "processing"; runId: string }
  | { phase: "duplicate"; previousDate: Date }
  | { phase: "error"; message: string }
  | { phase: "done" };

interface QueuedFile {
  id: string;
  file: File;
  content: string;
  wordCount: number;
  status: FileStatus;
}

type PasteState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "processing"; runId: string }
  | { phase: "duplicate"; previousDate: Date }
  | { phase: "error"; message: string };

export function TranscriptUploadForm({ accountId }: TranscriptUploadFormProps) {
  const [tab, setTab] = useState<"paste" | "files">("paste");
  const [pasteContent, setPasteContent] = useState("");
  const [pasteState, setPasteState] = useState<PasteState>({ phase: "idle" });
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const pasteWordCount = pasteContent.trim() ? pasteContent.trim().split(/\s+/).length : 0;

  // ── Paste tab ──────────────────────────────────────────────────────────────

  async function handlePasteSubmit(force = false) {
    if (!pasteContent.trim()) return;
    setPasteState({ phase: "uploading" });

    const result = await uploadTranscript(accountId, pasteContent, undefined, "paste");

    if ("error" in result) {
      setPasteState({ phase: "error", message: result.error });
      return;
    }
    if ("warning" in result && !force) {
      setPasteState({ phase: "duplicate", previousDate: result.previousDate });
      return;
    }
    if ("runId" in result) {
      setPasteState({ phase: "processing", runId: result.runId });
      setPasteContent("");
    }
  }

  // ── Files tab ──────────────────────────────────────────────────────────────

  async function extractText(file: File): Promise<string> {
    if (file.name.endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    if (file.name.endsWith(".pdf")) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      }
      return pages.join("\n");
    }
    return file.text();
  }

  async function readFiles(files: FileList) {
    const newItems: QueuedFile[] = [];
    for (const file of Array.from(files)) {
      try {
        const content = await extractText(file);
        const wordCount = content.trim().split(/\s+/).length;
        newItems.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          content,
          wordCount,
          status: { phase: "queued" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo leer el archivo";
        newItems.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          content: "",
          wordCount: 0,
          status: { phase: "error", message },
        });
      }
    }
    setFileQueue((prev) => [...prev, ...newItems]);
  }

  function removeFromQueue(id: string) {
    setFileQueue((prev) => prev.filter((f) => f.id !== id));
  }

  function updateStatus(id: string, status: FileStatus) {
    setFileQueue((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status } : f))
    );
  }

  async function processFile(item: QueuedFile, force = false) {
    updateStatus(item.id, { phase: "uploading" });
    const result = await uploadTranscript(
      accountId,
      item.content,
      item.file.name,
      "file"
    );

    if ("error" in result) {
      updateStatus(item.id, { phase: "error", message: result.error });
      return;
    }
    if ("warning" in result && !force) {
      updateStatus(item.id, { phase: "duplicate", previousDate: result.previousDate });
      return;
    }
    if ("runId" in result) {
      updateStatus(item.id, { phase: "processing", runId: result.runId });
    }
  }

  async function processAll() {
    const queued = fileQueue.filter((f) => f.status.phase === "queued");
    await Promise.all(queued.map((f) => processFile(f)));
  }

  const queuedCount = fileQueue.filter((f) => f.status.phase === "queued").length;
  const processingCount = fileQueue.filter(
    (f) => f.status.phase === "processing" || f.status.phase === "uploading"
  ).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(["paste", "files"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "paste" ? "Pegar texto" : "Subir archivos"}
          </button>
        ))}
      </div>

      {/* ── PASTE TAB ── */}
      {tab === "paste" && (
        <div className="space-y-3">
          {pasteState.phase === "processing" ? (
            <TranscriptProgress
              runId={pasteState.runId}
              accountId={accountId}
              hideWhenComplete
              onComplete={() => setPasteState({ phase: "idle" })}
            />
          ) : (
            <>
              {pasteState.phase === "duplicate" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        Esta transcripción ya fue procesada el{" "}
                        {new Date(pasteState.previousDate).toLocaleDateString("es-AR")}.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handlePasteSubmit(true)}
                          className="text-xs rounded-md bg-amber-600 text-white px-3 py-1 hover:bg-amber-700 transition-colors"
                        >
                          Procesar igual
                        </button>
                        <button
                          onClick={() => setPasteState({ phase: "idle" })}
                          className="text-xs rounded-md border border-border px-3 py-1 hover:bg-accent transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {pasteState.phase === "error" && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm text-destructive">{pasteState.message}</p>
                </div>
              )}

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) file.text().then(setPasteContent);
                }}
                className="relative"
              >
                <textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Pegá la transcripción aquí..."
                  rows={8}
                  className="w-full rounded-lg border border-input bg-background px-3 py-3 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="absolute bottom-2 right-3 text-xs text-muted-foreground">
                  {pasteWordCount > 0 ? `${pasteWordCount.toLocaleString()} palabras` : ""}
                </div>
              </div>

              <button
                onClick={() => handlePasteSubmit()}
                disabled={!pasteContent.trim() || pasteState.phase === "uploading"}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {pasteState.phase === "uploading" ? (
                  <><Loader2 size={14} className="animate-spin" /> Subiendo...</>
                ) : (
                  <><Upload size={14} /> Procesar transcripción</>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── FILES TAB ── */}
      {tab === "files" && (
        <div className="space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <FileText size={24} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Arrastrá archivos acá o hacé clic para seleccionar
            </p>
            <p className="text-xs text-muted-foreground/70">
              .txt, .doc, .docx, .pdf · Múltiples archivos soportados
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.doc,.docx,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) readFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* File queue */}
          {fileQueue.length > 0 && (
            <div className="space-y-2">
              {fileQueue.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{item.file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {item.wordCount.toLocaleString()} pal.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status.phase === "queued" && (
                        <span className="text-xs text-muted-foreground">En cola</span>
                      )}
                      {item.status.phase === "uploading" && (
                        <Loader2 size={13} className="animate-spin text-primary" />
                      )}
                      {item.status.phase === "done" && (
                        <span className="text-xs text-emerald-600">✓ Listo</span>
                      )}
                      {item.status.phase === "error" && (
                        <span className="text-xs text-destructive">Error</span>
                      )}
                      {item.status.phase === "duplicate" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => processFile(item, true)}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            Procesar igual
                          </button>
                          <span className="text-xs text-muted-foreground">·</span>
                        </div>
                      )}
                      {(item.status.phase === "queued" || item.status.phase === "error" || item.status.phase === "duplicate") && (
                        <button
                          onClick={() => removeFromQueue(item.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar per file */}
                  {item.status.phase === "processing" && (
                    <div className="pl-2">
                      <TranscriptProgress
                        runId={item.status.runId}
                        accountId={accountId}
                        hideWhenComplete
                        onComplete={() => removeFromQueue(item.id)}
                      />
                    </div>
                  )}

                  {item.status.phase === "error" && (
                    <p className="text-xs text-destructive pl-2">{item.status.message}</p>
                  )}

                  {item.status.phase === "duplicate" && (
                    <p className="text-xs text-amber-600 pl-2">
                      Ya procesada el{" "}
                      {new Date(item.status.previousDate).toLocaleDateString("es-AR")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Process all button */}
          {queuedCount > 0 && (
            <button
              onClick={processAll}
              disabled={processingCount > 0 && queuedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Upload size={14} />
              Procesar {queuedCount} transcripción{queuedCount !== 1 ? "es" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
