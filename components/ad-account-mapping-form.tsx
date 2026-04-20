"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAdAccountMapping } from "@/app/actions/meta-connections";

const CONVERSION_EVENTS = [
  { value: "lead", label: "Lead" },
  { value: "complete_registration", label: "CompleteRegistration" },
  { value: "contact", label: "Contact" },
  { value: "submit_application", label: "SubmitApplication" },
  { value: "purchase", label: "Purchase (e-commerce)" },
] as const;

interface PlaniAccount {
  id: string;
  name: string;
}

interface AdAccountMappingFormProps {
  adAccountId: string;
  currentAccountId: string | null;
  currentIsEcommerce: boolean;
  currentConversionEvent: string;
  planiAccounts: PlaniAccount[];
}

export function AdAccountMappingForm({
  adAccountId,
  currentAccountId,
  currentIsEcommerce,
  currentConversionEvent,
  planiAccounts,
}: AdAccountMappingFormProps) {
  const [accountId, setAccountId] = useState<string>(currentAccountId ?? "");
  const [isEcommerce, setIsEcommerce] = useState(currentIsEcommerce);
  const [conversionEvent, setConversionEvent] = useState(currentConversionEvent);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const result = await updateAdAccountMapping({
        adAccountId,
        accountId: accountId || null,
        isEcommerce,
        conversionEvent,
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
      if (result.triggeredBackfill) {
        setSyncing(true);
        setTimeout(() => setSyncing(false), 10000);
      }
    });
  }

  const dirty =
    (accountId || "") !== (currentAccountId ?? "") ||
    isEcommerce !== currentIsEcommerce ||
    conversionEvent !== currentConversionEvent;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        disabled={isPending}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Sin mapear</option>
        {planiAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <label className="inline-flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={isEcommerce}
          onChange={(e) => setIsEcommerce(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        E-commerce
      </label>

      <select
        value={conversionEvent}
        onChange={(e) => setConversionEvent(e.target.value)}
        disabled={isPending}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {CONVERSION_EVENTS.map((ev) => (
          <option key={ev.value} value={ev.value}>
            {ev.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={save}
        disabled={!dirty || isPending}
        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Guardando..." : saved ? "✓ Guardado" : "Guardar"}
      </button>

      {syncing && (
        <span className="text-xs text-muted-foreground">
          Sincronizando 90 días de datos… puede tardar unos minutos. La página se actualizará sola.
        </span>
      )}
    </div>
  );
}
