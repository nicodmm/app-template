"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface EnrichmentStatusPollerProps {
  /** Current value of accounts.enrichmentStatus on the server. */
  status: string | null;
}

const POLL_INTERVAL_MS = 4000;

/**
 * While the account's enrichment is in flight (status === "pending"),
 * trigger router.refresh() every few seconds so the page picks up the
 * "ok" / "failed" terminal state without the user having to reload.
 *
 * The component renders nothing — it's a side-effect island.
 */
export function EnrichmentStatusPoller({
  status,
}: EnrichmentStatusPollerProps) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "pending") return;
    const id = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [status, router]);

  return null;
}
