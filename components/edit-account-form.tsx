"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateAccount } from "@/app/actions/accounts";
import type { AccountWithOwner } from "@/lib/queries/accounts";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import { ServiceScopeCheckboxes } from "@/components/service-scope-checkboxes";
import { AccountModulesToggles } from "@/components/account-modules-toggles";

interface EditAccountFormProps {
  account: AccountWithOwner;
  members: WorkspaceMemberWithUser[];
}

const initialState = { error: undefined as string | undefined };

export function EditAccountForm({ account, members }: EditAccountFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => {
      const result = await updateAccount(formData);
      return { error: result.error };
    },
    initialState
  );

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
        <ServiceScopeCheckboxes defaultValue={account.serviceScope} />
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
    </form>
  );
}
