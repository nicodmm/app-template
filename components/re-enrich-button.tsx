"use client";

import { useTransition } from "react";
import { reEnrichAccount } from "@/app/actions/accounts";

interface ReEnrichButtonProps {
  accountId: string;
  disabled?: boolean;
}

export function ReEnrichButton({ accountId, disabled }: ReEnrichButtonProps) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await reEnrichAccount(accountId);
        })
      }
      disabled={disabled || pending}
      className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Enviando..." : "Re-enriquecer"}
    </button>
  );
}
