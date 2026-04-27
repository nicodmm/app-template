"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for /app/accounts/[accountId] and any child route
 * (paid-media, crm, etc.). Catches render-time exceptions in any of
 * the streamed sections so the user gets a friendly UI instead of
 * Next.js's generic "Application error" page.
 */
export default function AccountDetailError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[account-detail] render error", error);
  }, [error]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="rounded-xl p-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold">
              Algo se rompió cargando esta cuenta
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Probablemente fue un hipo transitorio (sync de paid media o CRM
              en curso). Tocá Reintentar — casi siempre arranca.
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground mt-3 font-mono">
                ID del error: {error.digest}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <RefreshCw size={13} aria-hidden />
                Reintentar
              </button>
              <Link
                href="/app/portfolio"
                className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-accent/50"
              >
                Volver al portfolio
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
