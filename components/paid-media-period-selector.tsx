"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const PRESETS = [
  { value: "7", label: "7 días" },
  { value: "14", label: "14 días" },
  { value: "30", label: "30 días" },
] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PaidMediaPeriodSelector() {
  const router = useRouter();
  const params = useSearchParams();

  const preset = params.get("preset") ?? "7";
  const sinceParam = params.get("since");
  const untilParam = params.get("until");
  const isCustom = preset === "custom";

  const applyPreset = useCallback(
    (days: number) => {
      const qp = new URLSearchParams(params);
      qp.set("preset", String(days));
      qp.delete("since");
      qp.delete("until");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const applyCustom = useCallback(
    (since: string, until: string) => {
      const qp = new URLSearchParams(params);
      qp.set("preset", "custom");
      qp.set("since", since);
      qp.set("until", until);
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const today = isoDate(new Date());
  const defaultSince = sinceParam ?? isoDate(new Date(Date.now() - 7 * 86400000));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => applyPreset(Number(p.value))}
          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            preset === p.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {p.label}
        </button>
      ))}

      <div className="flex items-center gap-1">
        <input
          type="date"
          value={isCustom ? sinceParam ?? defaultSince : ""}
          max={today}
          onChange={(e) => applyCustom(e.target.value, untilParam ?? today)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <input
          type="date"
          value={isCustom ? untilParam ?? today : ""}
          max={today}
          onChange={(e) => applyCustom(sinceParam ?? defaultSince, e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
