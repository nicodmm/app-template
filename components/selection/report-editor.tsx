"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Pencil, Sparkles, Upload } from "lucide-react";
import {
  generateCandidateReport,
  saveCandidateReport,
  uploadCandidateReport,
} from "@/app/actions/selection";
import { extractTextFromFile } from "@/lib/selection/extract-text-client";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import type { SelectionCandidate } from "@/lib/drizzle/schema";

/** Lee un File a base64 sin el prefijo "data:...;base64,". */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("No se pudo leer el archivo"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Error de lectura"));
    reader.readAsDataURL(file);
  });
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(candidate.reportContent ?? "");

  const status = candidate.reportStatus ?? "none";
  const isGenerating = status === "generating";

  // While the report is generating, poll the server so it appears on its own
  // (the trigger.dev task finishes ~20-40s later, out of band). Capped so a
  // stuck generation doesn't poll forever.
  useEffect(() => {
    if (!isGenerating) return;
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      if (count > 30) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [isGenerating, router]);

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

  function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      let extractedText: string | null = null;
      try {
        extractedText = await extractTextFromFile(file);
      } catch {
        extractedText = null;
      }
      let fileBase64: string;
      try {
        fileBase64 = await fileToBase64(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al leer el archivo");
        return;
      }
      const result = await uploadCandidateReport({
        accountId,
        searchId,
        candidateId: candidate.id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        extractedText: extractedText && extractedText.trim() ? extractedText : null,
        fileBase64,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!result.success) {
        setError(result.error ?? "Error al subir el informe");
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            onChange={handleUploadFile}
            disabled={isPending}
            className="hidden"
            id="report-file-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            title="Subir un informe ya hecho (.pdf, .docx)"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <Upload size={14} aria-hidden />
            {isPending ? "Subiendo…" : "Subir informe"}
          </button>
        </div>
      )}
      {candidate.reportFileName && !editing && (
        <p className="text-xs text-muted-foreground truncate">
          Archivo: <span className="text-foreground">{candidate.reportFileName}</span>
        </p>
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
