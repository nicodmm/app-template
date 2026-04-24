import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import { getPortfolioAccounts } from "@/lib/queries/accounts";
import { AccountCard } from "@/components/account-card";
import { redirect } from "next/navigation";

export default async function PortfolioPage() {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");
  const member = await getWorkspaceMember(workspace.id, userId);
  if (!member) redirect("/auth/login");

  const accounts = await getPortfolioAccounts({
    workspaceId: workspace.id,
    userId,
    role: member.role,
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {accounts.length === 0
              ? "Aún no tenés cuentas"
              : `${accounts.length} cuenta${accounts.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link
          href="/app/accounts/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          Nueva cuenta
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <div className="text-4xl mb-4">📋</div>
          <h2 className="font-semibold mb-1">Creá tu primera cuenta</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Las cuentas son el corazón de nao.fyi. Cada cuenta representa un
            cliente y acumula su historial, tareas y señales de salud.
          </p>
          <Link
            href="/app/accounts/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            Crear primera cuenta
          </Link>
        </div>
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
