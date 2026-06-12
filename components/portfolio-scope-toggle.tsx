"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface PortfolioScopeToggleProps {
  mine: boolean;
}

export function PortfolioScopeToggle({ mine }: PortfolioScopeToggleProps) {
  const router = useRouter();
  const params = useSearchParams();

  const setMine = useCallback(
    (next: boolean) => {
      const qp = new URLSearchParams(params);
      if (next) qp.set("mine", "1");
      else qp.delete("mine");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const optClass = (selected: boolean) =>
    cn(
      "inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      selected
        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
        : "[background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-accent/50"
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setMine(false)} className={optClass(!mine)} aria-pressed={!mine}>
        Todas
      </button>
      <button type="button" onClick={() => setMine(true)} className={optClass(mine)} aria-pressed={mine}>
        Mis cuentas
      </button>
    </div>
  );
}
