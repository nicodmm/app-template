"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EndDateField({ defaultValue }: { defaultValue?: string | null }) {
  const [has, setHas] = useState(!!defaultValue);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={has}
          onChange={(e) => setHas(e.target.checked)}
          className="rounded border-border text-primary"
        />
        ¿Tiene fecha de finalización?
      </label>
      {has && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endDate">Fecha de finalización del proyecto</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={defaultValue ?? ""}
          />
        </div>
      )}
    </div>
  );
}
