import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/drizzle/db";
import { metaConnections, metaAdAccounts, accounts } from "@/lib/drizzle/schema";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { DeleteButton } from "@/components/delete-button";
import { AdAccountMappingForm } from "@/components/ad-account-mapping-form";
import { disconnectMetaConnection } from "@/app/actions/meta-connections";

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string }>;
}

export default async function IntegrationsPage({ searchParams }: PageProps) {
  const userId = await requireUserId();
  const { connected, error } = await searchParams;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [connections, adAccounts, planiAccounts] = await Promise.all([
    db.select().from(metaConnections).where(eq(metaConnections.workspaceId, workspace.id)),
    db.select().from(metaAdAccounts).where(eq(metaAdAccounts.workspaceId, workspace.id)),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.workspaceId, workspace.id)),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Integraciones</h1>

      {connected === "meta" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 mb-6">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            ✓ Meta Ads conectado. Ahora mapeá los ad accounts a cuentas plani.fyi.
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-6">
          <p className="text-sm text-destructive">Error en la conexión: {error}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">📊 Meta Ads</h2>
          {connections.length === 0 && (
            <Link
              href="/api/auth/meta/login"
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Conectar Meta Ads
            </Link>
          )}
        </div>

        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no conectaste Meta. Conectá tu cuenta para ver los ad accounts de tus clientes.
          </p>
        ) : (
          <div className="space-y-4">
            {connections.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{c.metaUserName ?? c.metaUserId}</p>
                    <p className="text-xs text-muted-foreground">
                      Estado: {c.status}
                      {c.tokenExpiresAt && (
                        <> · Expira {new Date(c.tokenExpiresAt).toLocaleDateString("es-AR")}</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/api/auth/meta/login"
                      className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      Reconectar
                    </Link>
                    <DeleteButton
                      action={async () => {
                        "use server";
                        await disconnectMetaConnection(c.id);
                      }}
                      confirmMessage="¿Desconectar Meta? Se eliminarán todos los ad accounts vinculados."
                      className="inline-flex items-center rounded-md border border-destructive/30 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/10 transition-colors"
                    >
                      Desconectar
                    </DeleteButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {adAccounts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Ad accounts disponibles</h2>
          <div className="space-y-3">
            {adAccounts.map((aa) => (
              <div key={aa.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">{aa.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {aa.metaAdAccountId} · {aa.currency} · {aa.timezone}
                      {aa.lastSyncedAt && (
                        <> · última sync {new Date(aa.lastSyncedAt).toLocaleString("es-AR")}</>
                      )}
                    </p>
                  </div>
                </div>
                <AdAccountMappingForm
                  adAccountId={aa.id}
                  currentAccountId={aa.accountId}
                  currentIsEcommerce={aa.isEcommerce}
                  currentConversionEvent={aa.conversionEvent}
                  planiAccounts={planiAccounts}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
