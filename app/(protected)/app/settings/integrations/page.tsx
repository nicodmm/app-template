import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { eq, and, inArray } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/drizzle/db";
import { metaConnections, metaAdAccounts, accounts, crmConnections } from "@/lib/drizzle/schema";
import { getWorkspaceByUserId, getWorkspaceMember, getWorkspaceMembers } from "@/lib/queries/workspace";
import { getVisibleDriveConnections } from "@/lib/queries/drive";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { MetaConnectionCard } from "@/components/meta-connection-card";
import { DriveConnectionSection } from "@/components/drive-connection-section";

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string; drive?: string; drive_error?: string }>;
}

export default async function IntegrationsPage({ searchParams }: PageProps) {
  const userId = await requireUserId();
  const { connected, error, drive, drive_error: driveError } = await searchParams;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const member = await getWorkspaceMember(workspace.id, userId);
  const isOwner = member?.role === "owner";

  const driveConns = await getVisibleDriveConnections(workspace.id, userId, isOwner);
  const myPersonal = driveConns.find(
    (c) => c.connectedByUserId === userId && c.scope === "personal"
  );
  const canManageShared = member?.role === "owner" || member?.role === "admin";
  const driveConfigured = isGoogleOAuthConfigured();

  const allConnections = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspace.id));

  const connections = allConnections.filter(
    (c) => isOwner || c.connectedByUserId === userId
  );
  const visibleConnIds = connections.map((c) => c.id);

  const [adAccounts, planiAccounts, crmRows] = await Promise.all([
    visibleConnIds.length > 0
      ? db
          .select()
          .from(metaAdAccounts)
          .where(
            and(
              eq(metaAdAccounts.workspaceId, workspace.id),
              inArray(metaAdAccounts.connectionId, visibleConnIds)
            )
          )
      : Promise.resolve([]),
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

  const membersList = isOwner ? await getWorkspaceMembers(workspace.id) : [];
  const nameByUserId = new Map(membersList.map((m) => [m.userId, m.displayName]));

  const adAccountsByConnection = new Map<string, typeof adAccounts>();
  for (const aa of adAccounts) {
    const list = adAccountsByConnection.get(aa.connectionId) ?? [];
    list.push(aa);
    adAccountsByConnection.set(aa.connectionId, list);
  }

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
              <MetaConnectionCard
                key={c.id}
                connectionId={c.id}
                metaLabel={c.metaUserName ?? c.metaUserId}
                status={c.status}
                tokenExpiresAt={c.tokenExpiresAt}
                ownerName={isOwner ? (nameByUserId.get(c.connectedByUserId ?? "") ?? null) : null}
                adAccounts={(adAccountsByConnection.get(c.id) ?? []).map((aa) => ({
                  id: aa.id,
                  accountId: aa.accountId,
                  metaAdAccountId: aa.metaAdAccountId,
                  name: aa.name,
                  currency: aa.currency,
                  timezone: aa.timezone,
                  isEcommerce: aa.isEcommerce,
                  conversionEvent: aa.conversionEvent,
                  lastSyncedAt: aa.lastSyncedAt,
                }))}
                planiAccounts={planiAccounts}
              />
            ))}
          </div>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3">Google Drive</h2>
        {!driveConfigured ? (
          <p className="text-sm text-muted-foreground">
            La integración de Google Drive no está configurada (faltan credenciales OAuth).
          </p>
        ) : (
          <div className="space-y-4">
            {drive && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                Drive conectado correctamente.
              </div>
            )}
            {driveError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Error al conectar Drive: {decodeURIComponent(driveError)}
              </div>
            )}

            <details className="mb-4 rounded-lg p-3 text-sm [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
              <summary className="cursor-pointer font-medium select-none">
                ¿Usás Tactiq para transcribir reuniones?
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                <li>
                  En Tactiq, activá el auto-guardado a Google Drive con tu cuenta de
                  Google.
                </li>
                <li>
                  Conectá esa misma cuenta acá como tu Drive personal y elegí la
                  carpeta <strong>&ldquo;Tactiq Transcription&rdquo;</strong>.
                </li>
                <li>
                  Cada nueva reunión se importa sola y se rutea a la cuenta del
                  cliente por el nombre o el contenido del transcript.
                </li>
              </ol>
            </details>

            <div className="flex flex-wrap gap-2">
              {!myPersonal && (
                <Link
                  href="/api/auth/google/login?returnTo=/app/settings/integrations"
                  className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Conectar mi Drive
                </Link>
              )}
              {canManageShared && (
                <Link
                  href="/api/auth/google/login?scope=workspace&returnTo=/app/settings/integrations"
                  className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  Conectar Drive compartido del workspace
                </Link>
              )}
            </div>

            {driveConns.map((conn) => (
              <DriveConnectionSection
                key={conn.id}
                connection={{
                  id: conn.id,
                  scope: conn.scope,
                  googleAccountEmail: conn.googleAccountEmail,
                  folderId: conn.folderId,
                  folderName: conn.folderName,
                  linkOnlySync: conn.linkOnlySync,
                  lastSyncAt: conn.lastSyncAt,
                  lastError: conn.lastError,
                }}
                canManage={
                  conn.scope === "workspace"
                    ? canManageShared
                    : conn.connectedByUserId === userId || isOwner
                }
              />
            ))}
          </div>
        )}
      </section>

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
