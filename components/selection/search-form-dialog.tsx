"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2 } from "lucide-react";
import { createSearch, updateSearch, deleteSearch } from "@/app/actions/selection";

const STATUS_OPTIONS = [
  { value: "active", label: "Activa" },
  { value: "paused", label: "Pausada" },
  { value: "closed", label: "Cerrada" },
] as const;

export interface EditSearchData {
  id: string;
  position: string;
  positionDescription?: string | null;
  status: string;
  razonSocial: string | null;
  cuit: string | null;
}

interface CreateMode {
  mode: "create";
}

interface EditMode {
  mode: "edit";
  search: EditSearchData;
}

type DialogMode = CreateMode | EditMode;

interface Props {
  accountId: string;
  open: boolean;
  onClose: () => void;
  dialogMode: DialogMode;
}

export function SearchFormDialog({ accountId, open, onClose, dialogMode }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = dialogMode.mode === "edit";
  const editSearch = isEdit ? dialogMode.search : null;

  const [position, setPosition] = useState(editSearch?.position ?? "");
  const [positionDescription, setPositionDescription] = useState(
    editSearch?.positionDescription ?? ""
  );
  const [razonSocial, setRazonSocial] = useState(editSearch?.razonSocial ?? "");
  const [cuit, setCuit] = useState(editSearch?.cuit ?? "");
  const [status, setStatus] = useState(editSearch?.status ?? "active");

  // Reset fields when the dialog opens with fresh mode
  function handleClose() {
    setError(null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      let result: { success: boolean; error?: string };

      if (isEdit && editSearch) {
        result = await updateSearch({
          searchId: editSearch.id,
          accountId,
          position: position.trim(),
          positionDescription: positionDescription.trim() || null,
          status,
          razonSocial: razonSocial.trim() || null,
          cuit: cuit.trim() || null,
        });
      } else {
        result = await createSearch({
          accountId,
          position: position.trim(),
          positionDescription: positionDescription.trim() || null,
          razonSocial: razonSocial.trim() || null,
          cuit: cuit.trim() || null,
        });
      }

      if (!result.success) {
        setError(result.error ?? "Error al guardar");
        return;
      }

      router.refresh();
      handleClose();
    });
  }

  function handleDelete() {
    if (!editSearch) return;
    if (
      !window.confirm(
        `¿Eliminar la búsqueda "${editSearch.position}"? Se borran también sus candidatos y el link público. No se puede deshacer.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSearch({ accountId, searchId: editSearch.id });
      if (!result.success) {
        setError(result.error ?? "Error al eliminar");
        return;
      }
      router.refresh();
      handleClose();
    });
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Editar búsqueda" : "Nueva búsqueda"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-xl [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] backdrop-blur-[18px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Editar búsqueda" : "Nueva búsqueda"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Posición */}
          <div>
            <label htmlFor="sf-position" className="block text-sm font-medium mb-1">
              Posición <span className="text-destructive">*</span>
            </label>
            <input
              id="sf-position"
              type="text"
              required
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Ej: Product Manager"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Descripción del puesto */}
          <div>
            <label htmlFor="sf-description" className="block text-sm font-medium mb-1">
              Descripción del puesto
            </label>
            <textarea
              id="sf-description"
              rows={3}
              value={positionDescription}
              onChange={(e) => setPositionDescription(e.target.value)}
              placeholder="Responsabilidades, requisitos, etc."
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {/* Razón social + CUIT — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sf-razon-social" className="block text-sm font-medium mb-1">
                Razón social
              </label>
              <input
                id="sf-razon-social"
                type="text"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder="Empresa S.A."
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="sf-cuit" className="block text-sm font-medium mb-1">
                CUIT
              </label>
              <input
                id="sf-cuit"
                type="text"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="20-12345678-9"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {/* Estado — only in edit mode */}
          {isEdit && (
            <div>
              <label htmlFor="sf-status" className="block text-sm font-medium mb-1">
                Estado
              </label>
              <select
                id="sf-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="mr-auto inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive shadow-sm hover:bg-destructive/10 transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                <Trash2 size={14} aria-hidden />
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear búsqueda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
