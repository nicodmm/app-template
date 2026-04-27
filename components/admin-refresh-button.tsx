"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { refreshAdminDashboardNow } from "@/app/actions/admin-dashboard";

export function AdminRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<"ok" | "error" | null>(null);

  function onClick() {
    setFeedback(null);
    startTransition(async () => {
      const res = await refreshAdminDashboardNow();
      if (res.success) {
        setFeedback("ok");
        // Trigger run takes a few seconds — wait then refetch the page
        // so the new snapshot appears.
        window.setTimeout(() => {
          router.refresh();
          setFeedback(null);
        }, 12000);
      } else {
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
          Refresh disparado
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
          {pending ? "Disparando…" : "Refrescar ahora"}
        </>
      )}
    </button>
  );
}
