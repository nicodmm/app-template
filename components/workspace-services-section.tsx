"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { setWorkspaceServices } from "@/app/actions/workspace";

interface WorkspaceServicesSectionProps {
  initialServices: string[];
  canManage: boolean;
}

/**
 * Read-write list of the workspace's service catalog. Drives the
 * "Scope de servicio" checkbox grid in account create/edit. Renaming
 * here doesn't break existing accounts — they capture point-in-time
 * names — but it does mean the new label appears for future selections.
 */
export function WorkspaceServicesSection({
  initialServices,
  canManage,
}: WorkspaceServicesSectionProps) {
  const router = useRouter();
  const [services, setServices] = useState<string[]>(initialServices);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function persist(next: string[]) {
    setError(null);
    startTransition(async () => {
      const result = await setWorkspaceServices(next);
      if (result.error) {
        setError(result.error);
        // Snap back to last server-truth on error.
        setServices(initialServices);
        return;
      }
      router.refresh();
    });
  }

  function addService() {
    const name = draft.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (services.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setError("Ese servicio ya existe");
      return;
    }
    const next = [...services, name];
    setServices(next);
    setDraft("");
    persist(next);
  }

  function removeService(name: string) {
    const next = services.filter((s) => s !== name);
    setServices(next);
    persist(next);
  }

  return (
    <section className="rounded-xl p-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h2 className="font-semibold mb-1">Servicios</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Lista de servicios que tu agencia ofrece. Aparecen como opciones al
        crear o editar una cuenta.
      </p>

      <ul className="flex flex-wrap gap-2 mb-3">
        {services.map((s) => (
          <li
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium ring-1 ring-primary/20"
          >
            {s}
            {canManage && (
              <button
                type="button"
                onClick={() => removeService(s)}
                disabled={pending}
                aria-label={`Quitar ${s}`}
                className="rounded-full hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </li>
        ))}
        {services.length === 0 && (
          <li className="text-xs text-muted-foreground italic">
            Sin servicios configurados.
          </li>
        )}
      </ul>

      {canManage && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addService();
              }
            }}
            placeholder="Nuevo servicio (ej. Influencer Marketing)"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
            maxLength={60}
          />
          <button
            type="button"
            onClick={addService}
            disabled={pending || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Plus size={14} />
            Agregar
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
