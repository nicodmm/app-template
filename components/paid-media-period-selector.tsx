"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { DateRangePicker, type DateRangePreset } from "@/components/ui/date-range-picker";

const PRESETS: DateRangePreset[] = [
  { id: "7", label: "Últimos 7 días", days: 7 },
  { id: "14", label: "Últimos 14 días", days: 14 },
  { id: "30", label: "Últimos 30 días", days: 30 },
];

export function PaidMediaPeriodSelector() {
  const router = useRouter();
  const params = useSearchParams();

  const preset = params.get("preset") ?? "7";
  const sinceParam = params.get("since");
  const untilParam = params.get("until");
  const customRange =
    preset === "custom" && sinceParam && untilParam
      ? { since: sinceParam, until: untilParam }
      : undefined;

  const applyPreset = useCallback(
    (p: DateRangePreset) => {
      const qp = new URLSearchParams(params);
      qp.set("preset", p.id);
      qp.delete("since");
      qp.delete("until");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const applyCustom = useCallback(
    ({ since, until }: { since: string; until: string }) => {
      const qp = new URLSearchParams(params);
      qp.set("preset", "custom");
      qp.set("since", since);
      qp.set("until", until);
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  return (
    <DateRangePicker
      presets={PRESETS}
      value={preset}
      customRange={customRange}
      onPreset={applyPreset}
      onCustom={applyCustom}
    />
  );
}
