"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import {
  addAccountConsultant,
  removeAccountConsultant,
} from "@/app/actions/finance";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface Consultant {
  id: string;
  userId: string;
  neurona: string | null;
  roleLabel: string | null;
  displayName: string;
  email: string;
}

interface Props {
  accountId: string;
  consultants: Consultant[];
  members: WorkspaceMemberWithUser[];
  services: string[];
}

export function FinanceTeam({ accountId, consultants, members, services }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Add-consultant form state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedNeurona, setSelectedNeurona] = useState("");
  const [roleLabel, setRoleLabel] = useState("");

  function handleRemove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeAccountConsultant({ accountId, id });
      if (!res.success) {
        setError(res.error ?? "Error al eliminar");
      } else {
        router.refresh();
      }
    });
  }

  function handleAdd() {
    if (!selectedUserId) {
      setError("Seleccioná un miembro");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addAccountConsultant({
        accountId,
        userId: selectedUserId,
        neurona: selectedNeurona || null,
        roleLabel: roleLabel.trim() || null,
      });
      if (!res.success) {
        setError(res.error ?? "Error al agregar");
      } else {
        setSelectedUserId("");
        setSelectedNeurona("");
        setRoleLabel("");
        router.refresh();
      }
    });
  }

  const selectClass =
    "w-full rounded-md border px-3 py-1.5 text-sm bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Equipo consultor
      </h3>

      {/* Consultant list */}
      {consultants.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-4">Sin consultores asignados.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {consultants.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
            >
              <div className="min-w-0">
                <span className="font-medium truncate block">{c.displayName}</span>
                <span className="text-xs text-muted-foreground truncate block">
                  {[c.neurona, c.roleLabel].filter(Boolean).join(" · ") || c.email}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(c.id)}
                disabled={isPending}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                aria-label={`Eliminar a ${c.displayName}`}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add consultant */}
      <div className="rounded-lg p-3 space-y-2 [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]">
        <p className="text-xs font-medium text-muted-foreground">Agregar consultor</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className={selectClass}
            disabled={isPending}
            aria-label="Miembro del equipo"
          >
            <option value="">— Miembro —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>

          <select
            value={selectedNeurona}
            onChange={(e) => setSelectedNeurona(e.target.value)}
            className={selectClass}
            disabled={isPending}
            aria-label="Neurona / servicio"
          >
            <option value="">— Neurona (opcional) —</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Rol (opcional)"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            className={selectClass}
            disabled={isPending}
            aria-label="Etiqueta de rol"
          />
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !selectedUserId}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UserPlus size={13} aria-hidden />
          Agregar
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
