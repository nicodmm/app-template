"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageUp, Trash2 } from "lucide-react";
import {
  uploadWorkspaceLogo,
  clearWorkspaceLogo,
} from "@/app/actions/workspace";

interface WorkspaceLogoUploadProps {
  initialLogoUrl: string | null;
  canManage: boolean;
}

const MAX_BYTES = 2 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("No se pudo leer el archivo"));
        return;
      }
      // Strip the "data:<mime>;base64," prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

/**
 * Workspace logo control: shows the current logo, lets owner/admin upload a new
 * one (stored in Supabase Storage, public URL persisted server-side) or clear it.
 */
export function WorkspaceLogoUpload({
  initialLogoUrl,
  canManage,
}: WorkspaceLogoUploadProps): React.ReactElement {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePick(): void {
    setError(null);
    inputRef.current?.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file later.
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Seleccioná una imagen");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El archivo supera el máximo de 2 MB");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const fileBase64 = await fileToBase64(file);
        const result = await uploadWorkspaceLogo({
          fileBase64,
          mimeType: file.type,
          fileSize: file.size,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setLogoUrl(result.logoUrl ?? null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir");
      }
    });
  }

  function handleClear(): void {
    setError(null);
    startTransition(async () => {
      const result = await clearWorkspaceLogo();
      if (result.error) {
        setError(result.error);
        return;
      }
      setLogoUrl(null);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl p-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h2 className="font-semibold mb-1">Logo del workspace</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Se muestra centrado en la barra superior. PNG, JPG, WEBP, SVG o GIF
        (máx. 2 MB).
      </p>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/40 ring-1 ring-black/5 dark:bg-white/5">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Logo del workspace"
              width={64}
              height={64}
              className="h-full w-full object-contain"
              unoptimized
            />
          ) : (
            <ImageUp size={22} className="text-muted-foreground" />
          )}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={handlePick}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <ImageUp size={14} />
              {logoUrl ? "Cambiar" : "Subir logo"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleClear}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={14} />
                Quitar
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </section>
  );
}
