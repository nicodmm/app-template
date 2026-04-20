"use client";

import { useState, useTransition } from "react";
import { triggerBackfillForAdAccount } from "@/app/actions/meta-connections";

interface Props {
  adAccountId: string;
}

export function BackfillButton({ adAccountId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [triggered, setTriggered] = useState(false);

  function run() {
    startTransition(async () => {
      await triggerBackfillForAdAccount(adAccountId);
      setTriggered(true);
      setTimeout(() => setTriggered(false), 4000);
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={isPending}
      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
    >
      {isPending ? "Disparando…" : triggered ? "✓ Backfill disparado" : "Re-sync 90 días"}
    </button>
  );
}
