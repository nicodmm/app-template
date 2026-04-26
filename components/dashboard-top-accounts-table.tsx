"use client";

import Link from "next/link";

interface TopActivityRow {
  accountId: string;
  accountName: string;
  fee: number | null;
  transcriptsCount: number;
  documentsCount: number;
  activityCount: number;
  activityPerMonth: number | null;
}

interface DashboardTopAccountsTableProps {
  rows: TopActivityRow[];
}

function formatFee(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPerMonth(n: number | null): string {
  if (n === null) return "—";
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

export function DashboardTopAccountsTable({
  rows,
}: DashboardTopAccountsTableProps) {
  return (
    <div className="rounded-xl backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold">Top actividad</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          promedio mensual del cliente
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Sin actividad en el período.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Cliente</th>
              <th className="px-4 py-2 text-right font-medium">Fee</th>
              <th
                className="px-4 py-2 text-right font-medium"
                title="Reuniones + archivos en el período, divididos por meses activos del cliente"
              >
                Act./mes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.accountId}
                className="[border-top:1px_solid_var(--glass-tile-border)]"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/app/accounts/${r.accountId}`}
                    className="hover:text-primary transition-colors"
                  >
                    {r.accountName}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {formatFee(r.fee)}
                </td>
                <td
                  className="px-4 py-2 text-right tabular-nums"
                  title={`${r.transcriptsCount} reuniones · ${r.documentsCount} archivos en el período · total ${r.activityCount}`}
                >
                  {formatPerMonth(r.activityPerMonth)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
