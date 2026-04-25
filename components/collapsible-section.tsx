"use client";

import { useState, type ReactNode, type ComponentType } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ size?: number; className?: string }>;

interface CollapsibleSectionProps {
  title: string;
  /** Optional Lucide icon shown to the left of the title. */
  icon?: IconComponent;
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Optional anchor id so other UI (e.g. strip chart) can scroll into view. */
  id?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon: Icon,
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
        {Icon && (
          <Icon
            size={16}
            className={cn(
              "shrink-0 transition-colors",
              open ? "text-primary" : "text-muted-foreground"
            )}
          />
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
