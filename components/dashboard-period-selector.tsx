"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  DateRangePicker,
  type DateRangePreset,
} from "@/components/ui/date-range-picker";

const PRESETS: DateRangePreset[] = [
  { id: "30", label: "Últimos 30 días", days: 30 },
  { id: "90", label: "Últimos 90 días", days: 90 },
  { id: "180", label: "Últimos 180 días", days: 180 },
  { id: "365", label: "Último año", days: 365 },
];

export function DashboardPeriodSelector() {
  const router = useRouter();
  const params = useSearchParams();

  const preset = params.get("preset") ?? "90";
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
