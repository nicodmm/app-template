"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createCandidate, updateCandidate } from "@/app/actions/selection";
import type { SelectionCandidate } from "@/lib/drizzle/schema";

interface Props {
  accountId: string;
  searchId: string;
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  candidate?: SelectionCandidate;
  /** Called after a successful save (before onClose). */
  onSuccess?: () => void;
}

export function CandidateFormDialog({
  accountId,
  searchId,
  open,
  onClose,
  mode,
  candidate,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === "edit";

  const [firstName, setFirstName] = useState(candidate?.firstName ?? "");
  const [lastName, setLastName] = useState(candidate?.lastName ?? "");
  const [email, setEmail] = useState(candidate?.email ?? "");
  const [phone, setPhone] = useState(candidate?.phone ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(candidate?.linkedinUrl ?? "");
  const [expectedSalary, setExpectedSalary] = useState(candidate?.expectedSalary ?? "");
  const [currentSalary, setCurrentSalary] = useState(candidate?.currentSalary ?? "");

  function handleClose(): void {
    setError(null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      let result: { success: boolean; error?: string };

      if (isEdit && candidate) {
        result = await updateCandidate({
          accountId,
          searchId,
          candidateId: candidate.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
          expectedSalary: expectedSalary.trim() || null,
          currentSalary: currentSalary.trim() || null,
        });
      } else {
        result = await createCandidate({
          accountId,
          searchId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
          expectedSalary: expectedSalary.trim() || null,
          currentSalary: currentSalary.trim() || null,
        });
      }

      if (!result.success) {
        setError(result.error ?? "Error al guardar");
        return;
      }

      router.refresh();
      onSuccess?.();
      handleClose();
    });
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Editar candidato" : "Nuevo candidato"}
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
            {isEdit ? "Editar candidato" : "Nuevo candidato"}
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
          {/* Nombre + Apellido */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cf-first-name" className="block text-sm font-medium mb-1">
                Nombre <span className="text-destructive">*</span>
              </label>
              <input
                id="cf-first-name"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Juan"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="cf-last-name" className="block text-sm font-medium mb-1">
                Apellido <span className="text-destructive">*</span>
              </label>
              <input
                id="cf-last-name"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Pérez"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="cf-email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="cf-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="juan@ejemplo.com"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Teléfono + LinkedIn */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cf-phone" className="block text-sm font-medium mb-1">
                Teléfono
              </label>
              <input
                id="cf-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+54 9 11 1234-5678"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="cf-linkedin" className="block text-sm font-medium mb-1">
                LinkedIn
              </label>
              <input
                id="cf-linkedin"
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/…"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {/* Remuneraciones */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cf-expected-salary" className="block text-sm font-medium mb-1">
                Remuneración pretendida
              </label>
              <input
                id="cf-expected-salary"
                type="text"
                value={expectedSalary}
                onChange={(e) => setExpectedSalary(e.target.value)}
                placeholder="Ej: $800.000"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="cf-current-salary" className="block text-sm font-medium mb-1">
                Remuneración actual
              </label>
              <input
                id="cf-current-salary"
                type="text"
                value={currentSalary}
                onChange={(e) => setCurrentSalary(e.target.value)}
                placeholder="Ej: $650.000"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
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
              {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar candidato"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
