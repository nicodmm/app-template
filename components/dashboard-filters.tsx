"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface DashboardFiltersProps {
  services: string[];
  members: Array<{ userId: string; displayName: string }>;
  showOwnerFilter: boolean;
}

export function DashboardFilters({
  services,
  members,
  showOwnerFilter,
}: DashboardFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const currentService = params.get("service") ?? "";
  const currentOwner = params.get("owner") ?? "";

  const onServiceChange = useCallback(
    (value: string) => {
      const qp = new URLSearchParams(params);
      if (value) qp.set("service", value);
      else qp.delete("service");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const onOwnerChange = useCallback(
    (value: string) => {
      const qp = new URLSearchParams(params);
      if (value) qp.set("owner", value);
      else qp.delete("owner");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const selectClass =
    "h-9 rounded-md px-3 text-sm backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Servicio
        </span>
        <select
          value={currentService}
          onChange={(e) => onServiceChange(e.target.value)}
          className={selectClass}
          aria-label="Filtrar por servicio"
        >
          <option value="">Todos los servicios</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="Sin servicio">Sin servicio</option>
        </select>
      </label>

      {showOwnerFilter && (
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Responsable
          </span>
          <select
            value={currentOwner}
            onChange={(e) => onOwnerChange(e.target.value)}
            className={selectClass}
            aria-label="Filtrar por responsable"
          >
            <option value="">Todos los responsables</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
