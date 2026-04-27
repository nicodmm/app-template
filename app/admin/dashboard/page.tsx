import Link from "next/link";
import {
  Briefcase,
  FileText,
  Sparkles,
  TrendingUp,
  Users as UsersIcon,
  Building2,
  DollarSign,
  Zap,
  Coins,
  Wrench,
} from "lucide-react";
import { readAdminDashboardSnapshot } from "@/lib/queries/admin-snapshot";
import { AdminRefreshButton } from "@/components/admin-refresh-button";

// Dynamic so cookie-based auth in the parent layout still works. The
// page itself only does a single SELECT against admin_dashboard_snapshot
// — all the heavy aggregate work runs in a separate Trigger.dev task.
export const dynamic = "force-dynamic";

function formatInteger(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("es-AR").format(n);
}

function formatUsd(n: number): string {
  if (n < 0.01 && n > 0) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} día${days !== 1 ? "s" : ""}`;
}

export default async function AdminDashboardPage() {
  const snap = await readAdminDashboardSnapshot();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Plataforma</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {snap
              ? `Snapshot actualizado ${timeAgo(snap.refreshedAt)}.`
              : "Snapshot aún no generado — tocá Refrescar ahora."}
          </p>
        </div>
        <AdminRefreshButton />
      </div>

      {!snap ? (
        <section className="rounded-xl p-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Wrench size={16} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">Sin datos todavía</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                El cron horario aún no corrió por primera vez. Tocá{" "}
                <strong>Refrescar ahora</strong> para disparar el cómputo
                manualmente — tarda ~10-15 segundos y la página se va a
                refrescar sola.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiTile
              label="Workspaces totales"
              value={formatInteger(snap.workspacesTotal)}
              icon={<Building2 size={13} />}
              hint={
                snap.workspacesNew30d > 0
                  ? `+${snap.workspacesNew30d} en 30 días`
                  : "Sin altas en 30 días"
              }
            />
            <KpiTile
              label="Usuarios totales"
              value={formatInteger(snap.usersTotal)}
              icon={<UsersIcon size={13} />}
              hint={
                snap.usersNew30d > 0
                  ? `+${snap.usersNew30d} en 30 días`
                  : "Sin altas en 30 días"
              }
            />
            <KpiTile
              label="Cuentas activas"
              value={formatInteger(snap.accountsActive)}
              icon={<Briefcase size={13} />}
            />
            <KpiTile
              label="Transcripciones (30d)"
              value={formatInteger(snap.transcriptsCompleted30d)}
              icon={<FileText size={13} />}
              hint="Procesamiento completado"
            />
            <KpiTile
              label="Workspaces nuevos (30d)"
              value={formatInteger(snap.workspacesNew30d)}
              icon={<TrendingUp size={13} />}
            />
            <KpiTile
              label="Usuarios nuevos (30d)"
              value={formatInteger(snap.usersNew30d)}
              icon={<Sparkles size={13} />}
            />
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold mb-3">Consumo de IA</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="Costo USD (30d)"
                value={formatUsd(Number(snap.llmCostUsd30d))}
                icon={<DollarSign size={13} />}
                hint="Calculado al momento de cada call"
              />
              <KpiTile
                label="Tokens (30d)"
                value={formatTokens(snap.llmTokensTotal30d)}
                icon={<Zap size={13} />}
                hint="Input + output + cache"
              />
              <KpiTile
                label="Costo lifetime"
                value={formatUsd(Number(snap.llmCostUsdLifetime))}
                icon={<Coins size={13} />}
              />
              <KpiTile
                label="Tokens lifetime"
                value={formatTokens(snap.llmTokensLifetime)}
                icon={<Zap size={13} />}
              />
            </div>

            <div className="mt-4 rounded-xl backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h3 className="text-sm font-semibold">Costo por tarea</h3>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  últimos 30 días
                </span>
              </div>
              {snap.llmByTask.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-muted-foreground">
                  Aún no hay registros de uso.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">
                          Tarea
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Calls
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Input tokens
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Output tokens
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Costo USD
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.llmByTask.map((row) => (
                        <tr
                          key={row.taskName}
                          className="[border-top:1px_solid_var(--glass-tile-border)]"
                        >
                          <td className="px-4 py-2 font-medium">
                            <code className="text-xs">{row.taskName}</code>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatInteger(row.calls)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                            {formatTokens(row.inputTokens)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                            {formatTokens(row.outputTokens)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">
                            {formatUsd(row.costUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-xl backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold">Workspaces</h2>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                últimos 30 días
              </span>
            </div>
            {snap.topWorkspaces.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-muted-foreground">
                Sin actividad en el período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">
                        Workspace
                      </th>
                      <th className="px-4 py-2 text-left font-medium">
                        Owner
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Cuentas
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Transcripciones
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Señales activas
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Última actividad
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.topWorkspaces.map((w) => (
                      <tr
                        key={w.workspaceId}
                        className="[border-top:1px_solid_var(--glass-tile-border)]"
                      >
                        <td className="px-4 py-2 font-medium">
                          {w.workspaceName}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {w.ownerDisplay ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatInteger(w.accountsActive)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatInteger(w.transcripts30d)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatInteger(w.signalsActive)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatDate(w.lastActivityAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold">Usuarios</h2>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {snap.topUsers.length} en total
              </span>
            </div>
            {snap.topUsers.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-muted-foreground">
                Aún no hay usuarios registrados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">
                        Usuario
                      </th>
                      <th className="px-4 py-2 text-left font-medium">Email</th>
                      <th className="px-4 py-2 text-left font-medium">Rol</th>
                      <th className="px-4 py-2 text-right font-medium">
                        Workspaces
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Transcripciones (30d)
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Última actividad
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Alta
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.topUsers.map((u) => (
                      <tr
                        key={u.userId}
                        className="[border-top:1px_solid_var(--glass-tile-border)]"
                      >
                        <td className="px-4 py-2 font-medium">
                          {u.fullName ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {u.email}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {u.role}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatInteger(u.workspacesCount)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatInteger(u.transcripts30d)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatDate(u.lastActivityAt)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatDate(u.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Los datos se refrescan automáticamente cada hora. Tocá{" "}
        <Link
          href="/admin/dashboard"
          className="underline underline-offset-2"
        >
          recargar
        </Link>{" "}
        para ver el último snapshot.
      </p>
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
