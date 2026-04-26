import {
  Briefcase,
  FileText,
  Sparkles,
  TrendingUp,
  Users as UsersIcon,
  Building2,
} from "lucide-react";
import { getAdminDashboardMetrics } from "@/lib/queries/admin";

function formatInteger(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminDashboardPage() {
  const snapshot = await getAdminDashboardMetrics();
  const { kpis, topWorkspaces } = snapshot;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Plataforma</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Métricas globales y workspaces más activos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile
          label="Workspaces totales"
          value={formatInteger(kpis.workspacesTotal)}
          icon={<Building2 size={13} />}
          hint={
            kpis.workspacesNew30d > 0
              ? `+${kpis.workspacesNew30d} en 30 días`
              : "Sin altas en 30 días"
          }
        />
        <KpiTile
          label="Usuarios totales"
          value={formatInteger(kpis.usersTotal)}
          icon={<UsersIcon size={13} />}
          hint={
            kpis.usersNew30d > 0
              ? `+${kpis.usersNew30d} en 30 días`
              : "Sin altas en 30 días"
          }
        />
        <KpiTile
          label="Cuentas activas"
          value={formatInteger(kpis.accountsActive)}
          icon={<Briefcase size={13} />}
        />
        <KpiTile
          label="Transcripciones (30d)"
          value={formatInteger(kpis.transcriptsCompleted30d)}
          icon={<FileText size={13} />}
          hint="Procesamiento completado"
        />
        <KpiTile
          label="Workspaces nuevos (30d)"
          value={formatInteger(kpis.workspacesNew30d)}
          icon={<TrendingUp size={13} />}
        />
        <KpiTile
          label="Usuarios nuevos (30d)"
          value={formatInteger(kpis.usersNew30d)}
          icon={<Sparkles size={13} />}
        />
      </div>

      <div className="mt-6 rounded-xl backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold">Workspaces más activos</h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            últimos 30 días
          </span>
        </div>
        {topWorkspaces.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-muted-foreground">
            Sin actividad en el período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Workspace</th>
                  <th className="px-4 py-2 text-left font-medium">Owner</th>
                  <th className="px-4 py-2 text-right font-medium">Cuentas</th>
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
                {topWorkspaces.map((w) => (
                  <tr
                    key={w.workspaceId}
                    className="[border-top:1px_solid_var(--glass-tile-border)]"
                  >
                    <td className="px-4 py-2 font-medium">{w.workspaceName}</td>
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
