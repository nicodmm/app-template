"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { deleteAccount } from "@/app/actions/accounts";

interface AccountDangerZoneProps {
  accountId: string;
  accountName: string;
}

/**
 * Hard-delete confirm-by-typing block. Lives at the bottom of the Edit
 * form. The day-to-day flow is to archive — this exists for GDPR-style
 * permanent deletion only.
 */
export function AccountDangerZone({
  accountId,
  accountName,
}: AccountDangerZoneProps) {
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const matches = confirmation.trim() === accountName;

  function onDelete() {
    if (!matches) return;
    startTransition(async () => {
      await deleteAccount(accountId);
    });
  }

  return (
    <div className="rounded-md p-4 [background:rgb(239_68_68/0.04)] [border:1px_solid_rgb(239_68_68/0.3)]">
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle
          size={16}
          className="mt-0.5 shrink-0 text-destructive"
          aria-hidden
        />
        <div>
          <p className="text-sm font-semibold text-destructive">
            Zona de peligro
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Eliminar permanentemente borra la cuenta y todos sus datos
            asociados (transcripciones, contactos, señales, historial). No se
            puede deshacer. Para conservar el histórico, usá el botón{" "}
            <strong className="text-foreground">Archivar</strong> del header.
          </p>
        </div>
      </div>

      <label
        htmlFor="confirm-delete-name"
        className="block text-xs font-medium mb-1.5"
      >
        Para confirmar, escribí el nombre exacto de la cuenta:{" "}
        <strong className="text-foreground">{accountName}</strong>
      </label>
      <input
        id="confirm-delete-name"
        type="text"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder={accountName}
        autoComplete="off"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
      />

      <button
        type="button"
        onClick={onDelete}
        disabled={!matches || pending}
        className="mt-3 inline-flex items-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Eliminando…" : "Eliminar permanentemente"}
      </button>
    </div>
  );
}
