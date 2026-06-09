"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAccountInvoiceCountry } from "@/app/actions/finance";

type InvoiceCountry = "AR" | "US" | null;

interface Props {
  accountId: string;
  initialCountry: InvoiceCountry;
}

const OPTIONS: { value: "AR" | "US"; label: string }[] = [
  { value: "AR", label: "Argentina" },
  { value: "US", label: "Estados Unidos" },
];

export function AccountInvoiceCountry({ accountId, initialCountry }: Props): React.ReactElement {
  const router = useRouter();
  const [country, setCountry] = useState<InvoiceCountry>(initialCountry);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(next: InvoiceCountry): void {
    const prev = country;
    setCountry(next);
    setError(null);
    startTransition(async () => {
      const res = await setAccountInvoiceCountry({ accountId, country: next });
      if (!res.success) {
        setCountry(prev);
        setError(res.error ?? "Error");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        ¿Factura en Argentina o en US?
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {OPTIONS.map((opt) => {
          const active = country === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => update(active ? null : opt.value)}
              disabled={isPending}
              aria-pressed={active}
              className={
                active
                  ? "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary ring-1 ring-primary/40 disabled:opacity-50"
                  : "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 [--tw-ring-color:var(--glass-border)] hover:text-foreground disabled:opacity-50"
              }
            >
              {opt.label}
            </button>
          );
        })}
        {country === null && (
          <span className="text-xs text-muted-foreground">Sin definir</span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
