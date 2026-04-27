"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertCircle, X, Loader2, StickyNote, Paperclip, Link as LinkIcon, FolderOpen, RefreshCw, Unlink } from "lucide-react";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import { uploadTranscript } from "@/app/actions/transcripts";
import { uploadContextDocument } from "@/app/actions/context-documents";
import {
  importDriveLinkForAccount,
  syncDriveFolderForAccountNow,
  unlinkDriveFolderForAccount,
} from "@/app/actions/drive";
import { parseDriveFolderIdFromUrl } from "@/lib/google/drive-links";
import { TranscriptProgress } from "@/components/transcript-progress";

interface ContextUploadFormProps {
  accountId: string;
  accountName: string;
  boundDriveFolder: {
    id: string;
    name: string;
    syncedAt: Date | null;
  } | null;
}

type TranscriptPasteState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "processing"; runId: string }
  | { phase: "duplicate"; previousDate: Date }
  | { phase: "error"; message: string };

type FileStatus =
  | { phase: "queued" }
  | { phase: "uploading" }
  | { phase: "processing"; runId: string }
  | { phase: "duplicate"; previousDate: Date }
  | { phase: "error"; message: string }
  | { phase: "done" };

interface QueuedTranscript {
  id: string;
  file: File;
  content: string;
  wordCount: number;
  status: FileStatus;
}

type NoteState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "error"; message: string }
  | { phase: "done" };

type ContextFileStatus =
  | { phase: "queued" }
  | { phase: "uploading" }
  | { phase: "done" }
  | { phase: "error"; message: string };

interface QueuedContextFile {
  id: string;
  file: File;
  extractedText: string | null;
  notes: string;
  docType: string;
  status: ContextFileStatus;
}

function guessDocType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) return "spreadsheet";
  if (name.endsWith(".pptx") || name.endsWith(".ppt") || name.endsWith(".key")) return "presentation";
  if (name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".doc")) return "report";
  return "other";
}

const DOC_TYPE_LABEL: Record<string, string> = {
  note: "Nota",
  presentation: "Presentación",
  report: "Reporte",
  spreadsheet: "Planilla",
  other: "Otro",
};

export function ContextUploadForm({
  accountId,
  accountName,
  boundDriveFolder,
}: ContextUploadFormProps) {
  const [tab, setTab] = useState<"transcript" | "note" | "file" | "drive_link">("transcript");
  const router = useRouter();

  // Transcript paste state
  const [pasteContent, setPasteContent] = useState("");
  const [pasteState, setPasteState] = useState<TranscriptPasteState>({ phase: "idle" });

  // Transcript file queue
  const [transcriptQueue, setTranscriptQueue] = useState<QueuedTranscript[]>([]);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const [transcriptMode, setTranscriptMode] = useState<"paste" | "files">("files");

  // Note state
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteState, setNoteState] = useState<NoteState>({ phase: "idle" });

  // File context queue
  const [contextQueue, setContextQueue] = useState<QueuedContextFile[]>([]);
  const contextInputRef = useRef<HTMLInputElement>(null);

  // Drive link state
  const [driveLinkUrl, setDriveLinkUrl] = useState("");
  const [driveLinkNotes, setDriveLinkNotes] = useState("");
  const [driveLinkState, setDriveLinkState] = useState<
    | { phase: "idle" }
    | { phase: "submitting" }
    | { phase: "polling"; message: string }
    | { phase: "done"; message: string }
    | { phase: "error"; message: string }
    | { phase: "needs_connect" }
  >({ phase: "idle" });
  const driveLinkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Folder binding state (mirrored from props so we can update it after
  // unlink/sync without waiting for a router refresh).
  const [folder, setFolder] = useState(boundDriveFolder);
  const [folderAction, setFolderAction] = useState<
    | { phase: "idle" }
    | { phase: "syncing" }
    | { phase: "unlinking" }
    | { phase: "error"; message: string }
    | { phase: "info"; message: string }
  >({ phase: "idle" });
  // Only relevant when binding a NEW folder. After bind, future syncs
  // (cron + manual) always extract tasks. Default true — historical files
  // generate stale tasks, almost everyone wants to skip them.
  const [skipTaskExtraction, setSkipTaskExtraction] = useState(true);
  // Optional cross-contamination guard — only import files whose name
  // mentions the account name. Useful for shared folders. Default off
  // because the typical case is a dedicated folder per client.
  const [matchAccountName, setMatchAccountName] = useState(false);

  useEffect(() => {
    return () => {
      if (driveLinkPollRef.current) clearInterval(driveLinkPollRef.current);
    };
  }, []);

  const pasteWordCount = pasteContent.trim() ? pasteContent.trim().split(/\s+/).length : 0;

  // ── Shared helpers ─────────────────────────────────────────────────────────

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
        pages.push(
          content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
        );
      }
      return pages.join("\n");
    }
    if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      return file.text();
    }
    return "";
  }

  // ── Transcript paste ───────────────────────────────────────────────────────

  async function handlePasteSubmit(force = false) {
    if (!pasteContent.trim()) return;
    setPasteState({ phase: "uploading" });
    const result = await uploadTranscript(accountId, pasteContent, undefined, "paste");
    if ("error" in result) return setPasteState({ phase: "error", message: result.error });
    if ("warning" in result && !force) {
      return setPasteState({ phase: "duplicate", previousDate: result.previousDate });
    }
    if ("runId" in result) {
      setPasteState({ phase: "processing", runId: result.runId });
      setPasteContent("");
    }
  }

  // ── Transcript file queue ──────────────────────────────────────────────────

  async function readTranscriptFiles(files: FileList) {
    const newItems: QueuedTranscript[] = [];
    for (const file of Array.from(files)) {
      try {
        const content = await extractText(file);
        const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
        newItems.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          content,
          wordCount,
          status: { phase: "queued" },
        });
      } catch (err) {
        newItems.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          content: "",
          wordCount: 0,
          status: {
            phase: "error",
            message: err instanceof Error ? err.message : "No se pudo leer el archivo",
          },
        });
      }
    }
    setTranscriptQueue((prev) => [...prev, ...newItems]);
  }

  function updateTranscriptStatus(id: string, status: FileStatus) {
    setTranscriptQueue((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }

  async function processTranscriptFile(item: QueuedTranscript, force = false) {
    updateTranscriptStatus(item.id, { phase: "uploading" });
    const result = await uploadTranscript(accountId, item.content, item.file.name, "file");
    if ("error" in result) return updateTranscriptStatus(item.id, { phase: "error", message: result.error });
    if ("warning" in result && !force) {
      return updateTranscriptStatus(item.id, { phase: "duplicate", previousDate: result.previousDate });
    }
    if ("runId" in result) {
      updateTranscriptStatus(item.id, { phase: "processing", runId: result.runId });
    }
  }

  async function processAllTranscripts() {
    const queued = transcriptQueue.filter((f) => f.status.phase === "queued");
    await Promise.all(queued.map((f) => processTranscriptFile(f)));
  }

  // ── Note submit ────────────────────────────────────────────────────────────

  async function handleNoteSubmit() {
    if (!noteBody.trim()) {
      return setNoteState({ phase: "error", message: "Escribí el contenido de la nota" });
    }
    const title = noteTitle.trim() || noteBody.trim().slice(0, 80);
    setNoteState({ phase: "uploading" });
    const result = await uploadContextDocument({
      accountId,
      docType: "note",
      title,
      notes: noteBody,
      fileName: null,
      mimeType: null,
      fileSize: null,
      extractedText: null,
    });
    if (result.error) return setNoteState({ phase: "error", message: result.error });
    setNoteState({ phase: "done" });
    setNoteTitle("");
    setNoteBody("");
    router.refresh();
    setTimeout(() => setNoteState({ phase: "idle" }), 1500);
  }

  // ── Context file queue ─────────────────────────────────────────────────────

  async function readContextFiles(files: FileList) {
    const newItems: QueuedContextFile[] = [];
    for (const file of Array.from(files)) {
      let extractedText: string | null = null;
      try {
        const text = await extractText(file);
        extractedText = text.trim() ? text : null;
      } catch {
        // swallow; extraction is best-effort
      }
      newItems.push({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        extractedText,
        notes: "",
        docType: guessDocType(file),
        status: { phase: "queued" },
      });
    }
    setContextQueue((prev) => [...prev, ...newItems]);
  }

  function updateContextFile(id: string, patch: Partial<QueuedContextFile>) {
    setContextQueue((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function processContextFile(item: QueuedContextFile) {
    updateContextFile(item.id, { status: { phase: "uploading" } });
    const result = await uploadContextDocument({
      accountId,
      docType: item.docType,
      title: item.file.name,
      notes: item.notes || null,
      fileName: item.file.name,
      mimeType: item.file.type || null,
      fileSize: item.file.size,
      extractedText: item.extractedText,
    });
    if (result.error) {
      return updateContextFile(item.id, { status: { phase: "error", message: result.error } });
    }
    updateContextFile(item.id, { status: { phase: "done" } });
    router.refresh();
  }

  async function processAllContext() {
    const queued = contextQueue.filter((f) => f.status.phase === "queued");
    await Promise.all(queued.map((f) => processContextFile(f)));
  }

  const contextQueuedCount = contextQueue.filter((f) => f.status.phase === "queued").length;

  // ── Drive link ─────────────────────────────────────────────────────────────

  async function handleDriveLinkSubmit() {
    if (!driveLinkUrl.trim()) return;
    setDriveLinkState({ phase: "submitting" });
    const result = await importDriveLinkForAccount(
      accountId,
      driveLinkUrl.trim(),
      driveLinkNotes.trim() || undefined,
      { skipTaskExtraction, matchAccountName }
    );

    if (result.outcome === "drive_not_connected") {
      setDriveLinkState({ phase: "needs_connect" });
      return;
    }

    if (result.error) {
      setDriveLinkState({ phase: "error", message: result.error });
      return;
    }

    // Folder binding flow — different UX from single-file import.
    if (result.outcome === "folder_bound") {
      const folderName = result.folderName ?? "la carpeta";
      setFolder({ id: "", name: folderName, syncedAt: null });
      setDriveLinkUrl("");
      setDriveLinkNotes("");
      setDriveLinkState({
        phase: "polling",
        message: `Carpeta "${folderName}" vinculada. Sincronizando archivos en segundo plano — van a aparecer en Archivos de contexto.`,
      });
      // Poll for refresh so the bound-folder banner picks up syncedAt.
      if (driveLinkPollRef.current) clearInterval(driveLinkPollRef.current);
      let attempts = 0;
      const maxAttempts = 24; // 24 × 5s = 2 min window for folder syncs
      driveLinkPollRef.current = setInterval(() => {
        router.refresh();
        attempts += 1;
        if (attempts >= maxAttempts && driveLinkPollRef.current) {
          clearInterval(driveLinkPollRef.current);
          driveLinkPollRef.current = null;
          setDriveLinkState({
            phase: "done",
            message: `Listo. Si no ves todos los archivos todavía, refrescá la página.`,
          });
        }
      }, 5000);
      return;
    }

    const name = result.fileName ?? "el archivo";

    if (result.outcome === "duplicate") {
      setDriveLinkState({
        phase: "done",
        message: `"${name}" ya estaba importado previamente.`,
      });
      setDriveLinkUrl("");
      setDriveLinkNotes("");
      return;
    }

    setDriveLinkUrl("");
    setDriveLinkNotes("");
    setDriveLinkState({
      phase: "polling",
      message: `Importando "${name}" desde Drive — va a aparecer en Archivos de contexto.`,
    });

    // The Trigger task runs async — schedule a few page refreshes so the new
    // row + extracted tasks show up without the user having to F5 manually.
    if (driveLinkPollRef.current) clearInterval(driveLinkPollRef.current);
    let attempts = 0;
    const maxAttempts = 18; // 18 × 5s = 90s window
    driveLinkPollRef.current = setInterval(() => {
      router.refresh();
      attempts += 1;
      if (attempts >= maxAttempts && driveLinkPollRef.current) {
        clearInterval(driveLinkPollRef.current);
        driveLinkPollRef.current = null;
        setDriveLinkState({
          phase: "done",
          message: `Listo. Si no ves "${name}" todavía, refrescá la página.`,
        });
      }
    }, 5000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Main tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit flex-wrap">
        {(
          [
            { key: "transcript", icon: FileText, label: "Transcripción" },
            { key: "note", icon: StickyNote, label: "Nota o mensaje" },
            { key: "file", icon: Paperclip, label: "Archivo" },
            { key: "drive_link", icon: LinkIcon, label: "Link de Drive" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {/* TRANSCRIPT TAB */}
      {tab === "transcript" && (
        <div className="space-y-3">
          <div className="flex gap-1 rounded-md bg-muted/50 p-0.5 w-fit">
            {(["paste", "files"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTranscriptMode(m)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  transcriptMode === m
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "paste" ? "Pegar texto" : "Subir archivos"}
              </button>
            ))}
          </div>

          {transcriptMode === "paste" ? (
            pasteState.phase === "processing" ? (
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

                <div className="relative">
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Pegá la transcripción acá..."
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
            )
          ) : (
            <>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length) readTranscriptFiles(e.dataTransfer.files);
                }}
                onClick={() => transcriptInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <FileText size={24} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Arrastrá archivos acá o hacé clic para seleccionar
                </p>
                <p className="text-xs text-muted-foreground/70">
                  .txt, .docx, .pdf · Múltiples archivos soportados
                </p>
              </div>
              <input
                ref={transcriptInputRef}
                type="file"
                accept=".txt,.docx,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) readTranscriptFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {transcriptQueue.length > 0 && (
                <div className="space-y-2">
                  {transcriptQueue.map((item) => (
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
                            <button
                              onClick={() => processTranscriptFile(item, true)}
                              className="text-xs text-amber-600 hover:underline"
                            >
                              Procesar igual
                            </button>
                          )}
                          {(item.status.phase === "queued" ||
                            item.status.phase === "error" ||
                            item.status.phase === "duplicate") && (
                            <button
                              onClick={() =>
                                setTranscriptQueue((prev) => prev.filter((f) => f.id !== item.id))
                              }
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {item.status.phase === "processing" && (
                        <div className="pl-2">
                          <TranscriptProgress
                            runId={item.status.runId}
                            accountId={accountId}
                            hideWhenComplete
                            onComplete={() =>
                              setTranscriptQueue((prev) => prev.filter((f) => f.id !== item.id))
                            }
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

              {transcriptQueue.some((f) => f.status.phase === "queued") && (
                <button
                  onClick={processAllTranscripts}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Upload size={14} />
                  Procesar cola
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* NOTE TAB */}
      {tab === "note" && (
        <div className="space-y-3">
          {noteState.phase === "error" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{noteState.message}</p>
            </div>
          )}
          {noteState.phase === "done" && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-3">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">Nota guardada.</p>
            </div>
          )}

          <input
            type="text"
            placeholder="Título (opcional — ej: Actualización Q2, Mensaje del cliente 15/04)"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Pegá o escribí el mensaje / contexto / update…"
            rows={8}
            className="w-full rounded-lg border border-input bg-background px-3 py-3 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={handleNoteSubmit}
            disabled={!noteBody.trim() || noteState.phase === "uploading"}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {noteState.phase === "uploading" ? (
              <><Loader2 size={14} className="animate-spin" /> Guardando...</>
            ) : (
              <><StickyNote size={14} /> Guardar nota</>
            )}
          </button>
        </div>
      )}

      {/* FILE TAB */}
      {tab === "file" && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) readContextFiles(e.dataTransfer.files);
            }}
            onClick={() => contextInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <Paperclip size={24} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Presentaciones, planillas, reportes, imágenes — lo que aporte contexto
            </p>
            <p className="text-xs text-muted-foreground/70">
              Extraemos texto de PDF / DOCX / TXT. Para otros formatos guardamos metadata y tu descripción.
            </p>
          </div>
          <input
            ref={contextInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) readContextFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {contextQueue.length > 0 && (
            <div className="space-y-2">
              {contextQueue.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip size={14} className="text-muted-foreground shrink-0" />
                      <span className="text-sm truncate font-medium">{item.file.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status.phase === "queued" && (
                        <span className="text-xs text-muted-foreground">En cola</span>
                      )}
                      {item.status.phase === "uploading" && (
                        <Loader2 size={13} className="animate-spin text-primary" />
                      )}
                      {item.status.phase === "done" && (
                        <span className="text-xs text-emerald-600">✓ Guardado</span>
                      )}
                      {item.status.phase === "error" && (
                        <span className="text-xs text-destructive">Error</span>
                      )}
                      {(item.status.phase === "queued" || item.status.phase === "error") && (
                        <button
                          onClick={() =>
                            setContextQueue((prev) => prev.filter((f) => f.id !== item.id))
                          }
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {item.status.phase !== "done" && (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr,2fr] gap-2">
                      <select
                        value={item.docType}
                        onChange={(e) => updateContextFile(item.id, { docType: e.target.value })}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                      >
                        {Object.entries(DOC_TYPE_LABEL)
                          .filter(([k]) => k !== "note")
                          .map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Descripción / notas (opcional)"
                        value={item.notes}
                        onChange={(e) => updateContextFile(item.id, { notes: e.target.value })}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                      />
                    </div>
                  )}

                  {item.status.phase === "error" && (
                    <p className="text-xs text-destructive">{item.status.message}</p>
                  )}

                  {item.extractedText && item.status.phase !== "done" && (
                    <p className="text-xs text-muted-foreground">
                      Texto extraído: {item.extractedText.length.toLocaleString()} caracteres
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {contextQueuedCount > 0 && (
            <button
              onClick={processAllContext}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Upload size={14} />
              Guardar {contextQueuedCount} archivo{contextQueuedCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* DRIVE LINK TAB */}
      {tab === "drive_link" && (
        <div className="space-y-3">
          {folder && <BoundFolderPanel
            folder={folder}
            actionState={folderAction}
            onSync={async () => {
              setFolderAction({ phase: "syncing" });
              const r = await syncDriveFolderForAccountNow(accountId);
              if (r.error) {
                setFolderAction({ phase: "error", message: r.error });
                return;
              }
              setFolderAction({
                phase: "info",
                message:
                  "Sincronización en marcha — los archivos nuevos van a aparecer en unos segundos.",
              });
              router.refresh();
              setTimeout(() => router.refresh(), 5000);
              setTimeout(() => router.refresh(), 15000);
              setTimeout(() => router.refresh(), 30000);
            }}
            onUnlink={async () => {
              if (
                !confirm(
                  "¿Desvincular la carpeta? Los archivos ya importados se quedan en la cuenta. Para volver a sincronizar tenés que pegar el link de la carpeta de nuevo."
                )
              )
                return;
              setFolderAction({ phase: "unlinking" });
              const r = await unlinkDriveFolderForAccount(accountId);
              if (r.error) {
                setFolderAction({ phase: "error", message: r.error });
                return;
              }
              setFolder(null);
              setFolderAction({ phase: "idle" });
              router.refresh();
            }}
          />}

          <p className="text-xs text-muted-foreground">
            Pegá un link a un archivo o una carpeta de Drive. Si es archivo, lo
            importamos como transcripción o doc de contexto según el formato.
            Si es <strong>carpeta</strong>, la vinculamos a la cuenta e
            importamos los <strong>24 archivos más recientes</strong> al
            instante. Después cada 10 minutos chequeamos si hay nuevos y los
            importamos solos.
          </p>

          {driveLinkState.phase === "error" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{driveLinkState.message}</p>
            </div>
          )}
          {driveLinkState.phase === "done" && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-3">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                {driveLinkState.message}
              </p>
            </div>
          )}
          {driveLinkState.phase === "polling" && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
              <Loader2 size={14} className="animate-spin text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-primary">{driveLinkState.message}</p>
            </div>
          )}
          {driveLinkState.phase === "needs_connect" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-4 space-y-2">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>Drive no está conectado</strong> en este workspace.
                Conectá tu cuenta de Google ahora — te traemos de vuelta acá
                cuando termines y podés volver a hacer click en{" "}
                <em>Importar desde Drive</em>.
              </p>
              <a
                href={`/api/auth/google/login?returnTo=${encodeURIComponent(
                  `/app/accounts/${accountId}`
                )}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-700 transition-colors"
              >
                <LinkIcon size={12} /> Conectar Google Drive
              </a>
            </div>
          )}

          <input
            type="url"
            placeholder="https://drive.google.com/file/d/... o https://drive.google.com/drive/folders/..."
            value={driveLinkUrl}
            onChange={(e) => setDriveLinkUrl(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {parseDriveFolderIdFromUrl(driveLinkUrl) && !folder && (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-xs text-muted-foreground rounded-md p-2.5 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
                <input
                  type="checkbox"
                  checked={skipTaskExtraction}
                  onChange={(e) => setSkipTaskExtraction(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-foreground">
                    No extraer tareas de los archivos viejos
                  </strong>{" "}
                  — recomendado para evitar que tu lista de tareas se llene con
                  cosas obsoletas. Los archivos nuevos que ingresen a la carpeta
                  a partir de ahora sí van a generar tareas automáticamente.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-muted-foreground rounded-md p-2.5 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
                <input
                  type="checkbox"
                  checked={matchAccountName}
                  onChange={(e) => setMatchAccountName(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-foreground">
                    Solo importar archivos cuyo nombre <em>contenga</em>{" "}
                    &quot;{accountName}&quot;
                  </strong>{" "}
                  — útil si la carpeta es compartida con otros clientes. Hace
                  matching <em>contains</em> (no exact), case-insensitive y sin
                  acentos: ej. &quot;Weekly - {accountName} - Abril.docx&quot;
                  pega bien. Aplica también al sync automático.
                </span>
              </label>
            </div>
          )}
          <textarea
            placeholder="Notas o descripción (opcional — solo aplica a archivos individuales)"
            value={driveLinkNotes}
            onChange={(e) => setDriveLinkNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={handleDriveLinkSubmit}
            disabled={
              !driveLinkUrl.trim() ||
              driveLinkState.phase === "submitting" ||
              driveLinkState.phase === "polling"
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {driveLinkState.phase === "submitting" ? (
              <><Loader2 size={14} className="animate-spin" /> Encolando...</>
            ) : driveLinkState.phase === "polling" ? (
              <><Loader2 size={14} className="animate-spin" /> Esperando import...</>
            ) : (
              <><LinkIcon size={14} /> Importar desde Drive</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

interface BoundFolderPanelProps {
  folder: { id: string; name: string; syncedAt: Date | null };
  actionState:
    | { phase: "idle" }
    | { phase: "syncing" }
    | { phase: "unlinking" }
    | { phase: "error"; message: string }
    | { phase: "info"; message: string };
  onSync: () => void;
  onUnlink: () => void;
}

function formatRelative(d: Date | null): string {
  if (!d) return "todavía no se sincronizó";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} día${days !== 1 ? "s" : ""}`;
}

function BoundFolderPanel({
  folder,
  actionState,
  onSync,
  onUnlink,
}: BoundFolderPanelProps) {
  return (
    <div className="rounded-lg p-4 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <FolderOpen
            size={18}
            className="text-primary shrink-0 mt-0.5"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              Carpeta vinculada: {folder.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Última sincronización: {formatRelative(folder.syncedAt)} · Importa
              hasta 200 archivos del nivel raíz (sin subcarpetas).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSync}
            disabled={
              actionState.phase === "syncing" ||
              actionState.phase === "unlinking"
            }
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50"
          >
            {actionState.phase === "syncing" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {actionState.phase === "syncing"
              ? "Sincronizando..."
              : "Sincronizar ahora"}
          </button>
          <button
            type="button"
            onClick={onUnlink}
            disabled={
              actionState.phase === "syncing" ||
              actionState.phase === "unlinking"
            }
            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2.5 py-1.5 text-xs hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Unlink size={12} />
            Desvincular
          </button>
        </div>
      </div>
      {actionState.phase === "error" && (
        <p className="text-xs text-destructive mt-3">{actionState.message}</p>
      )}
      {actionState.phase === "info" && (
        <p className="text-xs text-primary mt-3">{actionState.message}</p>
      )}
    </div>
  );
}
