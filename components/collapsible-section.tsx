"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <h2 className="font-semibold flex-1">{title}</h2>
        {summary && (
          <span className="shrink-0 text-xs text-muted-foreground">{summary}</span>
        )}
      </button>

      {open && <div className="px-6 pb-6 pt-2 border-t border-border">{children}</div>}
    </div>
  );
}
