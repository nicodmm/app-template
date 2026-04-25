import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/drizzle/db";
import { metaConnections, metaAdAccounts, accounts, crmConnections } from "@/lib/drizzle/schema";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { DeleteButton } from "@/components/delete-button";
import { AdAccountMappingForm } from "@/components/ad-account-mapping-form";
import { BackfillButton } from "@/components/backfill-button";
import { disconnectMetaConnection } from "@/app/actions/meta-connections";

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string }>;
}

export default async function IntegrationsPage({ searchParams }: PageProps) {
  const userId = await requireUserId();
  const { connected, error } = await searchParams;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [connections, adAccounts, planiAccounts, crmRows] = await Promise.all([
    db.select().from(metaConnections).where(eq(metaConnections.workspaceId, workspace.id)),
    db.select().from(metaAdAccounts).where(eq(metaAdAccounts.workspaceId, workspace.id)),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.workspaceId, workspace.id)),
    db
      .select({
        id: crmConnections.id,
        provider: crmConnections.provider,
        externalCompanyDomain: crmConnections.externalCompanyDomain,
        status: crmConnections.status,
        accountId: crmConnections.accountId,
        accountName: accounts.name,
        catalogsConfiguredAt: crmConnections.catalogsConfiguredAt,
      })
      .from(crmConnections)
      .innerJoin(accounts, eq(crmConnections.accountId, accounts.id))
      .where(eq(crmConnections.workspaceId, workspace.id)),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Integraciones</h1>

      {connected === "meta" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 mb-6">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            ✓ Meta Ads conectado. Ahora mapeá los ad accounts a cuentas nao.fyi.
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-6">
          <p className="text-sm text-destructive">Error en la conexión: {error}</p>
        </div>
      )}

      <div className="rounded-xl p-6 mb-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold inline-flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" aria-hidden /> Meta Ads
          </h2>
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
        <div className="rounded-xl p-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <h2 className="font-semibold mb-4">Ad accounts disponibles</h2>
          <div className="space-y-3">
            {adAccounts.map((aa) => (
              <div key={aa.id} className="rounded-lg p-3 space-y-2 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
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
                  {aa.accountId && <BackfillButton adAccountId={aa.id} />}
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

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3">CRM</h2>
        {crmRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no conectaste ningún CRM. Entrá a la página de un cliente → sección CRM → &ldquo;Conectar Pipedrive&rdquo;.
          </p>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-3 font-normal">Cliente</th>
                  <th className="py-2 px-3 font-normal">Proveedor</th>
                  <th className="py-2 px-3 font-normal">Instancia</th>
                  <th className="py-2 px-3 font-normal">Status</th>
                  <th className="py-2 px-3 font-normal">Configurar</th>
                </tr>
              </thead>
              <tbody>
                {crmRows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 px-3 font-medium">{r.accountName}</td>
                    <td className="py-2 px-3">{r.provider}</td>
                    <td className="py-2 px-3">{r.externalCompanyDomain ?? "—"}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ${
                        r.status === "active"
                          ? "bg-green-500/15 text-green-700"
                          : r.status === "expired"
                          ? "bg-yellow-500/15 text-yellow-700"
                          : "bg-red-500/15 text-red-700"
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <Link
                        href={`/app/accounts/${r.accountId}/crm/setup`}
                        className="text-xs underline hover:no-underline"
                      >
                        {r.catalogsConfiguredAt ? "Editar" : "Configurar"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
