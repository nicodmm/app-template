"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DateRangePreset {
  /** Stable id used for selection state. */
  id: string;
  /** What to show in the button + popover row. */
  label: string;
  /** Number of days back (today minus). 0 = today. */
  days: number;
}

export interface DateRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

interface DateRangePickerProps {
  presets: DateRangePreset[];
  /** Currently selected preset id, or "custom" when a custom range is active. */
  value: string;
  /** Current custom range — only used when value === "custom". */
  customRange?: DateRange;
  /** Called when a preset is chosen. */
  onPreset: (preset: DateRangePreset) => void;
  /** Called after Aplicar in the custom range form. */
  onCustom: (range: DateRange) => void;
  className?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRange(range: DateRange): string {
  const f = (s: string) =>
    new Date(s).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return `${f(range.since)} → ${f(range.until)}`;
}

/**
 * Single-button date range picker with preset list + custom range form.
 * Inspired by Meta Business Manager: one trigger, one popover, presets on
 * the left column, custom inputs at the bottom. Replaces the previous
 * "preset chips + two raw date inputs" pattern that took too much real
 * estate in the page header.
 */
export function DateRangePicker({
  presets,
  value,
  customRange,
  onPreset,
  onCustom,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [sinceDraft, setSinceDraft] = useState(customRange?.since ?? "");
  const [untilDraft, setUntilDraft] = useState(customRange?.until ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSinceDraft(customRange?.since ?? "");
    setUntilDraft(customRange?.until ?? "");
  }, [customRange?.since, customRange?.until]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = isoDate(new Date());
  const selectedPreset = presets.find((p) => p.id === value);
  const triggerLabel =
    value === "custom" && customRange
      ? formatRange(customRange)
      : selectedPreset?.label ?? "Período";

  function applyCustom() {
    if (!sinceDraft || !untilDraft) return;
    if (new Date(sinceDraft) > new Date(untilDraft)) return;
    onCustom({ since: sinceDraft, until: untilDraft });
    setOpen(false);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          "[background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]",
          "hover:bg-white/40 dark:hover:bg-white/10"
        )}
      >
        <Calendar size={14} className="text-muted-foreground" aria-hidden />
        <span className="tabular-nums">{triggerLabel}</span>
        <ChevronDown
          size={13}
          className={cn(
            "text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl bg-card p-2 shadow-xl ring-1 ring-border"
        >
          <div className="flex flex-col">
            {presets.map((p) => {
              const isActive = p.id === value;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPreset(p);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2 text-sm text-left transition-colors",
                    isActive
                      ? "bg-primary/10 text-foreground font-medium"
                      : "hover:bg-accent"
                  )}
                >
                  {p.label}
                  {isActive && (
                    <Check size={14} className="text-primary" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-2 border-t border-border pt-2">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Personalizado
            </p>
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <input
                type="date"
                value={sinceDraft}
                max={untilDraft || today}
                onChange={(e) => setSinceDraft(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date"
                value={untilDraft}
                min={sinceDraft || undefined}
                max={today}
                onChange={(e) => setUntilDraft(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="px-3 pb-1 pt-1">
              <button
                type="button"
                onClick={applyCustom}
                disabled={!sinceDraft || !untilDraft}
                className="w-full rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
