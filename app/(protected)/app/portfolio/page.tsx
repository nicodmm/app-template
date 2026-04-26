import Link from "next/link";
import { Plus, Briefcase, Archive, Upload } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceWithMember } from "@/lib/queries/workspace";
import {
  getPortfolioAccounts,
  getPortfolioAccountCounts,
} from "@/lib/queries/accounts";
import { AccountCard } from "@/components/account-card";
import { PortfolioStatusTabs } from "@/components/portfolio-status-tabs";
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function PortfolioPage({ searchParams }: PageProps) {
  const userId = await requireUserId();
  const result = await getWorkspaceWithMember(userId);
  if (!result) redirect("/auth/login");
  const { workspace, member } = result;

  const params = await searchParams;
  const status: "active" | "archived" =
    params.status === "archived" ? "archived" : "active";

  const [accounts, counts] = await Promise.all([
    getPortfolioAccounts({
      workspaceId: workspace.id,
      userId,
      role: member.role,
      status,
    }),
    getPortfolioAccountCounts({
      workspaceId: workspace.id,
      userId,
      role: member.role,
    }),
  ]);

  const totalForCurrentTab = status === "active" ? counts.active : counts.archived;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalForCurrentTab === 0
              ? status === "archived"
                ? "Sin cuentas archivadas"
                : "Aún no tenés cuentas"
              : `${totalForCurrentTab} cuenta${totalForCurrentTab !== 1 ? "s" : ""} ${
                  status === "archived" ? "archivada" + (totalForCurrentTab !== 1 ? "s" : "") : "activa" + (totalForCurrentTab !== 1 ? "s" : "")
                }`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/app/accounts/import"
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-accent/50"
          >
            <Upload size={15} />
            Importar CSV
          </Link>
          <Link
            href="/app/accounts/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            Nueva cuenta
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <PortfolioStatusTabs
          active={counts.active}
          archived={counts.archived}
          current={status}
        />
      </div>

      {accounts.length === 0 ? (
        status === "archived" ? (
          <div className="flex flex-col items-center justify-center rounded-xl py-16 text-center backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_dashed_var(--glass-border)]">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
              <Archive size={26} aria-hidden />
            </div>
            <h2 className="font-semibold mb-1">Sin cuentas archivadas</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Cuando archivés una cuenta, aparece acá. Podés reabrirla cuando
              quieras desde el detalle.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl py-20 text-center backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_dashed_var(--glass-border)]">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Briefcase size={26} aria-hidden />
            </div>
            <h2 className="font-semibold mb-1">Creá tu primera cuenta</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Las cuentas son el corazón de nao.fyi. Cada cuenta representa un
              cliente y acumula su historial, tareas y señales de salud.
            </p>
            <Link
              href="/app/accounts/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <Plus size={15} />
              Crear primera cuenta
            </Link>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}
