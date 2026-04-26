"use client";

import { useTransition } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { closeAccount, reopenAccount } from "@/app/actions/accounts";

interface AccountStatusActionsProps {
  accountId: string;
  closedAt: Date | null;
}

/**
 * Header button to archive or reopen an account. Replaces the previous
 * hard-delete button — hard delete now lives behind the danger zone in
 * the Edit form.
 */
export function AccountStatusActions({
  accountId,
  closedAt,
}: AccountStatusActionsProps) {
  const [pending, startTransition] = useTransition();
  const isArchived = closedAt !== null;

  function onClick() {
    if (isArchived) {
      startTransition(async () => {
        await reopenAccount(accountId);
      });
      return;
    }
    const ok = window.confirm(
      "¿Archivar esta cuenta? Se quita del portfolio activo y del dashboard. Podés reabrirla cuando quieras."
    );
    if (!ok) return;
    startTransition(async () => {
      await closeAccount(accountId);
    });
  }

  if (isArchived) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <RotateCcw size={13} aria-hidden />
        {pending ? "Reabriendo…" : "Reabrir"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-60"
    >
      <Archive size={13} aria-hidden />
      {pending ? "Archivando…" : "Archivar"}
    </button>
  );
}
