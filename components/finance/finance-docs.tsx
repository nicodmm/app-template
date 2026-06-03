"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Link2, Loader2, Sparkles, Upload } from "lucide-react";
import {
  extractNda,
  getFinanceDocUrl,
  setFinanceDocUrl,
  uploadFinanceDoc,
} from "@/app/actions/finance";
import { extractTextFromFile } from "@/lib/selection/extract-text-client";
import { cn } from "@/lib/utils";

interface DocState {
  fileName: string | null;
  url: string | null;
  hasDoc: boolean;
}

interface Props {
  accountId: string;
  nda: DocState;
  proposal: DocState;
  ndaExtractionStatus: string;
  ndaExtractionError: string | null;
}

const STATUS_TEXT: Record<string, string> = {
  none: "Sin extraer",
  extracting: "Extrayendo…",
  ready: "Listo",
  error: "Error",
};

const STATUS_STYLE: Record<string, string> = {
  none: "bg-muted text-muted-foreground",
  extracting: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  error: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

/** Reads a File into a base64 string WITHOUT the "data:...;base64," prefix. */
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

interface DocCardProps {
  accountId: string;
  kind: "nda" | "proposal";
  label: string;
  doc: DocState;
}

function DocCard({ accountId, kind, label, doc }: DocCardProps): React.ReactElement {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState(doc.url ?? "");

  const currentLabel = doc.fileName
    ? doc.fileName
    : doc.url
      ? "URL externa"
      : "Sin documento";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    startTransition(async () => {
      let extractedText: string | null = null;
      if (kind === "nda") {
        try {
          extractedText = await extractTextFromFile(file);
        } catch {
          extractedText = null;
        }
      }

      let fileBase64: string;
      try {
        fileBase64 = await fileToBase64(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al leer el archivo");
        return;
      }

      const result = await uploadFinanceDoc({
        accountId,
        kind,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        extractedText: extractedText && extractedText.trim() ? extractedText : null,
        fileBase64,
      });

      if (fileInputRef.current) fileInputRef.current.value = "";

      if (!result.success) {
        setError(result.error ?? "Error al subir el documento");
        return;
      }
      router.refresh();
    });
  }

  function handleSaveUrl(): void {
    setError(null);
    if (!urlValue.trim()) {
      setError("Ingresá una URL");
      return;
    }
    startTransition(async () => {
      const result = await setFinanceDocUrl({ accountId, kind, url: urlValue.trim() });
      if (!result.success) {
        setError(result.error ?? "Error al guardar la URL");
        return;
      }
      router.refresh();
    });
  }

  function handleOpen(): void {
    setError(null);
    startTransition(async () => {
      const result = await getFinanceDocUrl({ accountId, kind });
      if (result.error || !result.url) {
        setError(result.error ?? "No se pudo obtener la URL del documento");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        {doc.hasDoc && (
          <button
            type="button"
            onClick={handleOpen}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <ExternalLink size={11} aria-hidden />
            Abrir
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">Actual:</span>
        <span className="truncate font-medium text-foreground">{currentLabel}</span>
      </div>

      {/* File upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileChange}
          disabled={isPending}
          className="hidden"
          id={`finance-doc-file-${kind}`}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          <Upload size={14} aria-hidden />
          {isPending ? "Subiendo…" : "Subir archivo (.pdf, .docx)"}
        </button>
      </div>

      {/* URL mode */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor={`finance-doc-url-${kind}`}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link2 size={12} aria-hidden />
          O enlazá una URL externa
        </label>
        <div className="flex gap-2">
          <input
            id={`finance-doc-url-${kind}`}
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://…"
            disabled={isPending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSaveUrl}
            disabled={isPending}
            className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            Guardar URL
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FinanceDocs({
  accountId,
  nda,
  proposal,
  ndaExtractionStatus,
  ndaExtractionError,
}: Props): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [extractError, setExtractError] = useState<string | null>(null);

  const status = ndaExtractionStatus ?? "none";
  const isExtracting = status === "extracting";

  // Auto-refresh while extracting (poll every 4s, cap at 30 tries)
  useEffect(() => {
    if (!isExtracting) return;
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
  }, [isExtracting, router]);

  function handleExtract(): void {
    setExtractError(null);
    startTransition(async () => {
      const result = await extractNda({ accountId });
      if (!result.success) {
        setExtractError(result.error ?? "Error al iniciar la extracción");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Documentos
      </h3>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* NDA */}
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <DocCard accountId={accountId} kind="nda" label="NDA / Acuerdo de confidencialidad" doc={nda} />

          {/* NDA extraction */}
          <div className="flex flex-col gap-2 pt-2 [border-top:1px_solid_var(--glass-border)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Extracción de datos legales</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  STATUS_STYLE[status] ?? STATUS_STYLE.none
                )}
              >
                {STATUS_TEXT[status] ?? status}
              </span>
            </div>

            {status === "error" && ndaExtractionError && (
              <p className="text-xs text-destructive">{ndaExtractionError}</p>
            )}

            {extractError && <p className="text-xs text-destructive">{extractError}</p>}

            <button
              type="button"
              onClick={handleExtract}
              disabled={isPending || isExtracting || !nda.hasDoc}
              title={!nda.hasDoc ? "Primero subí el NDA" : undefined}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              {isExtracting ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Sparkles size={14} aria-hidden />
              )}
              {isExtracting ? "Extrayendo…" : "Extraer datos del NDA"}
            </button>
          </div>
        </div>

        {/* Propuesta */}
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <DocCard accountId={accountId} kind="proposal" label="Propuesta comercial" doc={proposal} />
        </div>
      </div>
    </div>
  );
}
