"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAccountStatus } from "@/app/actions/accounts";
import { STATUS_LABELS, type AccountStatus } from "@/lib/accounts/status";

export function AccountStatusSelect({
  accountId,
  status,
}: {
  accountId: string;
  status: AccountStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: AccountStatus) {
    if (next === status) return;
    startTransition(async () => {
      await setAccountStatus(accountId, next);
      router.refresh();
    });
  }

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => change(e.target.value as AccountStatus)}
      aria-label="Estado de la cuenta"
      className="rounded-md px-3 py-1.5 text-xs font-medium backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
    >
      {(["active", "inactive", "finished"] as const).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
