"use client";

import { useTransition } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { reopenAccount } from "@/app/actions/accounts";

interface ArchivedAccountBannerProps {
  accountId: string;
  closedAt: Date;
}

export function ArchivedAccountBanner({
  accountId,
  closedAt,
}: ArchivedAccountBannerProps) {
  const [pending, startTransition] = useTransition();
  const formattedDate = new Date(closedAt).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mb-6 rounded-xl px-4 py-3 backdrop-blur-[14px] [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-2.5 flex-1">
          <Archive
            size={16}
            className="mt-0.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="text-sm">
            <p className="font-medium">Esta cuenta está archivada</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Archivada el {formattedDate}. Las métricas del dashboard no la
              incluyen.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await reopenAccount(accountId);
            })
          }
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <RotateCcw size={13} aria-hidden />
          {pending ? "Reabriendo…" : "Reabrir cuenta"}
        </button>
      </div>
    </div>
  );
}
