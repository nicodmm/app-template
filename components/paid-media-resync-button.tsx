"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { triggerBackfillForAdAccount } from "@/app/actions/meta-connections";

interface PaidMediaResyncButtonProps {
  adAccountId: string;
}

/**
 * Fires a manual backfill of the last 90 days for this ad account.
 * Useful right after first mapping when the user wants to verify
 * data is in DB without waiting for the hourly cron, or when the
 * connection looks stale.
 */
export function PaidMediaResyncButton({
  adAccountId,
}: PaidMediaResyncButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<"ok" | "error" | null>(null);

  function onClick() {
    setFeedback(null);
    startTransition(async () => {
      try {
        await triggerBackfillForAdAccount(adAccountId);
        setFeedback("ok");
        // Give the trigger task a moment to run, then refresh the page so
        // any new data appears.
        window.setTimeout(() => {
          router.refresh();
          setFeedback(null);
        }, 8000);
      } catch {
        setFeedback("error");
        window.setTimeout(() => setFeedback(null), 4000);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-accent/50 disabled:opacity-60"
    >
      {feedback === "ok" ? (
        <>
          <CheckCircle2 size={13} className="text-success" aria-hidden />
          Sync iniciada
        </>
      ) : feedback === "error" ? (
        <>
          <AlertCircle size={13} className="text-destructive" aria-hidden />
          Error
        </>
      ) : (
        <>
          <RefreshCw
            size={13}
            className={pending ? "animate-spin" : ""}
            aria-hidden
          />
          {pending ? "Iniciando…" : "Sincronizar ahora"}
        </>
      )}
    </button>
  );
}
