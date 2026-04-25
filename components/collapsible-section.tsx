"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  /**
   * Optional icon element rendered to the left of the title.
   * Pass a ReactNode (e.g. <CheckSquare size={16} />), NOT the component
   * itself — server components can't ship a function across the RSC boundary.
   */
  icon?: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Optional anchor id so other UI (e.g. strip chart) can scroll into view. */
  id?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  summary,
  defaultOpen = false,
  id,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      id={id}
      className={cn(
        "rounded-xl overflow-hidden backdrop-blur-[20px]",
        "[background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-white/30 dark:hover:bg-white/5"
      >
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        {icon && (
          <span
            className={cn(
              "shrink-0 transition-colors",
              open ? "text-primary" : "text-muted-foreground"
            )}
          >
            {icon}
          </span>
        )}
        <h2 className="font-semibold flex-1">{title}</h2>
        {summary && (
          <span className="shrink-0 text-xs text-muted-foreground">{summary}</span>
        )}
      </button>

      {open && (
        <div className="px-6 pb-6 pt-2 [border-top:1px_solid_var(--glass-border)]">
          {children}
        </div>
      )}
    </section>
  );
}
