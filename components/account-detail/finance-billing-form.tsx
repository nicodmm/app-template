"use client";

import { useTransition, useState } from "react";
import { saveAccountFinanceFields } from "@/app/actions/finance";
import type { AccountFinance } from "@/lib/drizzle/schema";

interface Props {
  accountId: string;
  finance: AccountFinance | null;
}

type FinanceFields = {
  razonSocial: string;
  cuit: string;
  billingEmail: string;
  ivaCondition: string;
  leadOrigin: string;
  clientEmail: string;
  clientResponsible: string;
  legalRepName: string;
  legalRepDni: string;
  legalRepEmail: string;
  legalAddress: string;
  city: string;
  country: string;
};

function toFormState(finance: AccountFinance | null): FinanceFields {
  return {
    razonSocial: finance?.razonSocial ?? "",
    cuit: finance?.cuit ?? "",
    billingEmail: finance?.billingEmail ?? "",
    ivaCondition: finance?.ivaCondition ?? "",
    leadOrigin: finance?.leadOrigin ?? "",
    clientEmail: finance?.clientEmail ?? "",
    clientResponsible: finance?.clientResponsible ?? "",
    legalRepName: finance?.legalRepName ?? "",
    legalRepDni: finance?.legalRepDni ?? "",
    legalRepEmail: finance?.legalRepEmail ?? "",
    legalAddress: finance?.legalAddress ?? "",
    city: finance?.city ?? "",
    country: finance?.country ?? "",
  };
}

export function FinanceBillingForm({ accountId, finance }: Props) {
  const [isPending, startTransition] = useTransition();
  const [fields, setFields] = useState<FinanceFields>(toFormState(finance));
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleChange(key: keyof FinanceFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
  }

  function handleSave() {
    setStatus("idle");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await saveAccountFinanceFields({
        accountId,
        fields: Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, v.trim() || null])
        ) as Parameters<typeof saveAccountFinanceFields>[0]["fields"],
      });
      if (res.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMsg(res.error ?? "Error al guardar");
      }
    });
  }

  const inputClass =
    "w-full rounded-md border px-3 py-1.5 text-sm bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 placeholder:text-muted-foreground";

  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block";

  function Field({
    label,
    fieldKey,
    placeholder,
  }: {
    label: string;
    fieldKey: keyof FinanceFields;
    placeholder?: string;
  }) {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <input
          type="text"
          value={fields[fieldKey]}
          onChange={(e) => handleChange(fieldKey, e.target.value)}
          placeholder={placeholder ?? ""}
          className={inputClass}
          disabled={isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Datos de facturación y legales
      </h3>

      {/* Billing info */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Razón social" fieldKey="razonSocial" placeholder="Empresa S.A." />
        <Field label="CUIT" fieldKey="cuit" placeholder="30-12345678-9" />
        <Field label="Mail de facturación" fieldKey="billingEmail" placeholder="facturación@empresa.com" />
        <Field label="Condición IVA" fieldKey="ivaCondition" placeholder="Responsable Inscripto" />
        <Field label="Origen del lead" fieldKey="leadOrigin" placeholder="Referido / LinkedIn / ..." />
      </div>

      {/* Client contact */}
      <div className="pt-3 [border-top:1px_solid_var(--glass-border)]">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Contacto en el cliente
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Mail del cliente" fieldKey="clientEmail" placeholder="cliente@empresa.com" />
          <Field label="Responsable en el cliente" fieldKey="clientResponsible" placeholder="Nombre y apellido" />
        </div>
      </div>

      {/* Legal rep */}
      <div className="pt-3 [border-top:1px_solid_var(--glass-border)]">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Representante legal
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nombre" fieldKey="legalRepName" placeholder="Juan Pérez" />
          <Field label="DNI" fieldKey="legalRepDni" placeholder="12.345.678" />
          <Field label="Mail" fieldKey="legalRepEmail" placeholder="jperez@empresa.com" />
        </div>
      </div>

      {/* Address */}
      <div className="pt-3 [border-top:1px_solid_var(--glass-border)]">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Domicilio legal
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3">
            <Field label="Domicilio" fieldKey="legalAddress" placeholder="Av. Corrientes 1234, piso 5" />
          </div>
          <Field label="Ciudad" fieldKey="city" placeholder="Buenos Aires" />
          <Field label="País" fieldKey="country" placeholder="Argentina" />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center rounded-md px-4 py-1.5 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>

        {status === "success" && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            Guardado correctamente
          </span>
        )}
        {status === "error" && errorMsg && (
          <span className="text-xs text-destructive">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
