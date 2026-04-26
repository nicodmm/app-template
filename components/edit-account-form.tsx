"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateAccount } from "@/app/actions/accounts";
import type { AccountWithOwner } from "@/lib/queries/accounts";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import { ServiceScopeCheckboxes } from "@/components/service-scope-checkboxes";
import { AccountModulesToggles } from "@/components/account-modules-toggles";
import { AccountDangerZone } from "@/components/account-danger-zone";

interface EditAccountFormProps {
  account: AccountWithOwner;
  members: WorkspaceMemberWithUser[];
  services: string[];
}

interface FormState {
  error?: string;
  /** Bumped on every successful save so the redirect effect re-fires. */
  successAt?: number;
}

const initialState: FormState = {};

export function EditAccountForm({ account, members, services }: EditAccountFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const result = await updateAccount(formData);
      if (result.error) return { error: result.error };
      return { successAt: Date.now() };
    },
    initialState
  );

  useEffect(() => {
    if (state.successAt) {
      router.replace(`/app/accounts/${account.id}`);
      router.refresh();
    }
  }, [state.successAt, account.id, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="accountId" value={account.id} />

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          Nombre <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={account.name}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div>
        <label htmlFor="goals" className="block text-sm font-medium mb-1">
          Objetivos
        </label>
        <textarea
          id="goals"
          name="goals"
          rows={3}
          defaultValue={account.goals ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>

      <div>
        <label htmlFor="ownerId" className="block text-sm font-medium mb-1">
          Responsable
        </label>
        <select
          id="ownerId"
          name="ownerId"
          defaultValue={account.ownerId ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Sin responsable</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Scope de servicio
        </label>
        <ServiceScopeCheckboxes
          options={services}
          defaultValue={account.serviceScope}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium mb-1">
            Fecha de inicio
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={account.startDate ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="fee" className="block text-sm font-medium mb-1">
            Fee mensual (USD)
          </label>
          <input
            id="fee"
            name="fee"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            defaultValue={account.fee ?? ""}
            placeholder="Ej: 3500"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div>
        <label htmlFor="websiteUrl" className="block text-sm font-medium mb-1">
          Página web
        </label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          defaultValue={account.websiteUrl ?? ""}
          placeholder="https://empresa.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Cambiarla vuelve a ejecutar el enriquecimiento automáticamente.
        </p>
      </div>

      <div>
        <label htmlFor="linkedinUrl" className="block text-sm font-medium mb-1">
          LinkedIn de la empresa
        </label>
        <input
          id="linkedinUrl"
          name="linkedinUrl"
          type="url"
          defaultValue={account.linkedinUrl ?? ""}
          placeholder="https://www.linkedin.com/company/..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <details className="rounded-md [border:1px_solid_var(--glass-tile-border)] [background:var(--glass-tile-bg)]">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
          Datos de la empresa (auto-enriquecidos — editables)
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-3 [border-top:1px_solid_var(--glass-tile-border)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="industry" className="block text-xs font-medium mb-1">
                Industria
              </label>
              <input
                id="industry"
                name="industry"
                type="text"
                defaultValue={account.industry ?? ""}
                placeholder="Ej: SaaS B2B"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="employeeCount" className="block text-xs font-medium mb-1">
                Cantidad de empleados
              </label>
              <input
                id="employeeCount"
                name="employeeCount"
                type="text"
                defaultValue={account.employeeCount ?? ""}
                placeholder="Ej: 11-50"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="location" className="block text-xs font-medium mb-1">
                Ubicación
              </label>
              <input
                id="location"
                name="location"
                type="text"
                defaultValue={account.location ?? ""}
                placeholder="Ej: Buenos Aires, Argentina"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="companyDescription"
                className="block text-xs font-medium mb-1"
              >
                Descripción
              </label>
              <textarea
                id="companyDescription"
                name="companyDescription"
                rows={3}
                defaultValue={account.companyDescription ?? ""}
                placeholder="Qué hace la empresa, en una o dos oraciones."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Estos campos los completa la IA al crear la cuenta o cuando cambia
            la web. Editalos cuando el auto-enriquecimiento no sea preciso.
          </p>
        </div>
      </details>

      <div>
        <label className="block text-sm font-medium mb-2">Módulos activos</label>
        <AccountModulesToggles defaultValue={account.enabledModules} />
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>
        <Link
          href={`/app/accounts/${account.id}`}
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancelar
        </Link>
      </div>

      <div className="pt-4 [border-top:1px_solid_var(--glass-tile-border)]">
        <AccountDangerZone
          accountId={account.id}
          accountName={account.name}
        />
      </div>
    </form>
  );
}
