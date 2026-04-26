"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardKPITileProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

export function DashboardKPITile({
  label,
  value,
  hint,
  icon,
  onClick,
}: DashboardKPITileProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col items-start gap-1 rounded-xl p-4 text-left backdrop-blur-[14px]",
        "[background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]",
        onClick &&
          "transition-all hover:[background:var(--glass-bg-strong)] hover:translate-y-[-1px] cursor-pointer"
      )}
    >
      <div className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {onClick && (
          <ChevronRight
            size={14}
            className="opacity-40 group-hover:opacity-100 transition-opacity"
            aria-hidden
          />
        )}
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Tag>
  );
}
