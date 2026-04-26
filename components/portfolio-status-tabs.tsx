"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface PortfolioStatusTabsProps {
  active: number;
  archived: number;
  current: "active" | "archived";
}

export function PortfolioStatusTabs({
  active,
  archived,
  current,
}: PortfolioStatusTabsProps) {
  const router = useRouter();
  const params = useSearchParams();

  const setStatus = useCallback(
    (next: "active" | "archived") => {
      const qp = new URLSearchParams(params);
      if (next === "active") qp.delete("status");
      else qp.set("status", next);
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const tabClass = (selected: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      selected
        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
        : "[background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-accent/50"
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setStatus("active")}
        className={tabClass(current === "active")}
        aria-pressed={current === "active"}
      >
        Activas
        <span className="text-xs opacity-80 tabular-nums">{active}</span>
      </button>
      <button
        type="button"
        onClick={() => setStatus("archived")}
        className={tabClass(current === "archived")}
        aria-pressed={current === "archived"}
      >
        Archivadas
        <span className="text-xs opacity-80 tabular-nums">{archived}</span>
      </button>
    </div>
  );
}
