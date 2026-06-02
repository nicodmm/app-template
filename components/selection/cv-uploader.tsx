"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, Upload } from "lucide-react";
import { setCandidateCvUrl, uploadCandidateCv } from "@/app/actions/selection";
import { extractTextFromFile } from "@/lib/selection/extract-text-client";
import { GlassCard } from "@/components/ui/glass-card";
import type { SelectionCandidate } from "@/lib/drizzle/schema";

interface Props {
  accountId: string;
  searchId: string;
  candidate: SelectionCandidate;
}

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

export function CvUploader({ accountId, searchId, candidate }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState(candidate.cvUrl ?? "");

  const currentLabel = candidate.cvFileName
    ? candidate.cvFileName
    : candidate.cvUrl
      ? "URL externa"
      : "Sin CV";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
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

      const result = await uploadCandidateCv({
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
        setError(result.error ?? "Error al subir el CV");
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
      const result = await setCandidateCvUrl({
        accountId,
        searchId,
        candidateId: candidate.id,
        cvUrl: urlValue.trim(),
      });
      if (!result.success) {
        setError(result.error ?? "Error al guardar la URL");
        return;
      }
      router.refresh();
    });
  }

  return (
    <GlassCard className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold">CV del candidato</h3>
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
          id="cv-file-input"
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
        <label htmlFor="cv-url-input" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 size={12} aria-hidden />
          O enlazá una URL externa
        </label>
        <div className="flex gap-2">
          <input
            id="cv-url-input"
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
    </GlassCard>
  );
}
