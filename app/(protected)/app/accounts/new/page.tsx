import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { createAccount } from "@/app/actions/accounts";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServiceScopeCheckboxes } from "@/components/service-scope-checkboxes";
import { AccountModulesToggles } from "@/components/account-modules-toggles";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewAccountPage({ searchParams }: PageProps) {
  const userId = await requireUserId();
  const { error } = await searchParams;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");
  const members = await getWorkspaceMembers(workspace.id);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        href="/app/portfolio"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        Volver al portfolio
      </Link>

      <h1 className="text-2xl font-semibold mb-1">Nueva cuenta</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Creá el perfil del cliente. Podés agregar más detalles después.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive mb-6">
          {decodeURIComponent(error)}
        </div>
      )}

      <form action={createAccount} className="space-y-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">
            Nombre del cliente <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="Ej: Acme Corp, Proyecto Atlas..."
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goals">Objetivos de la cuenta</Label>
          <textarea
            id="goals"
            name="goals"
            rows={3}
            placeholder="¿Qué está buscando lograr este cliente? ¿Cuáles son los KPIs clave?"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownerId">Responsable</Label>
          <select
            id="ownerId"
            name="ownerId"
            defaultValue={userId}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Sin responsable</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Scope de servicio</Label>
          <ServiceScopeCheckboxes />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Fecha de inicio del proyecto</Label>
            <Input id="startDate" name="startDate" type="date" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fee">Fee mensual (USD)</Label>
            <Input
              id="fee"
              name="fee"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="Ej: 3500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Módulos activos</Label>
          <p className="text-xs text-muted-foreground -mt-1">
            Elegí qué secciones ver en el perfil del cliente. Podés cambiar esto después.
          </p>
          <AccountModulesToggles />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" className="flex-1 sm:flex-none sm:px-8">
            Crear cuenta
          </Button>
          <Link
            href="/app/portfolio"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
