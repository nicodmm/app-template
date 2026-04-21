"use client";

import { useTransition } from "react";

interface DeleteButtonProps {
  action: () => Promise<void>;
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}

export function DeleteButton({ action, confirmMessage, className, children }: DeleteButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      className={className}
      onClick={() => {
        if (!confirm(confirmMessage)) return;
        startTransition(() => action());
      }}
    >
      {isPending ? "..." : children}
    </button>
  );
}
