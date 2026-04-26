"use client";

import { useState } from "react";
import {
  Briefcase,
  Wallet,
  Coins,
  Calendar,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { DashboardKPITile } from "@/components/dashboard-kpi-tile";
import { DashboardHealthDistribution } from "@/components/dashboard-health-distribution";
import { DashboardIndustriesChart } from "@/components/dashboard-industries-chart";
import { DashboardSizesChart } from "@/components/dashboard-sizes-chart";
import { DashboardTopAccountsTable } from "@/components/dashboard-top-accounts-table";
import { DashboardMetricDrawer } from "@/components/dashboard-metric-drawer";
import type {
  DashboardMetricKey,
  DashboardPeriod,
  DashboardSnapshot,
} from "@/lib/queries/dashboard";

interface DashboardSnapshotViewProps {
  snapshot: DashboardSnapshot;
  period: DashboardPeriod;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMoneyOrDash(n: number | null): string {
  return n === null ? "—" : formatMoney(n);
}

function formatMonths(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)} meses`;
}

function formatInteger(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}

interface OpenDrawer {
  metric: DashboardMetricKey;
  label: string;
  formatValue: (value: number) => string;
}

export function DashboardSnapshotView({
  snapshot,
  period,
}: DashboardSnapshotViewProps) {
  const [drawer, setDrawer] = useState<OpenDrawer | null>(null);

  const noFeeHint =
    snapshot.totalAccounts > 0 &&
    snapshot.accountsWithoutFee / snapshot.totalAccounts > 0.25
      ? `${snapshot.accountsWithoutFee} sin fee no incluidas`
      : undefined;

  const ltvHint = "Asume retención total — sin churn";

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardKPITile
          label="Clientes activos"
          value={formatInteger(snapshot.totalAccounts)}
          icon={<Briefcase size={13} />}
          onClick={() =>
            setDrawer({
              metric: "total_accounts",
              label: "Clientes activos",
              formatValue: (v) => formatInteger(v),
            })
          }
        />
        <DashboardKPITile
          label="Fee total"
          value={formatMoney(snapshot.feeTotal)}
          hint={noFeeHint}
          icon={<Wallet size={13} />}
          onClick={() =>
            setDrawer({
              metric: "fee_total",
              label: "Fee total",
              formatValue: (v) => formatMoney(v),
            })
          }
        />
        <DashboardKPITile
          label="Ticket medio"
          value={formatMoneyOrDash(snapshot.ticketAverage)}
          hint={noFeeHint}
          icon={<Coins size={13} />}
          onClick={() =>
            setDrawer({
              metric: "ticket_average",
              label: "Ticket medio",
              formatValue: (v) => formatMoney(v),
            })
          }
        />
        <DashboardKPITile
          label="Duración media"
          value={formatMonths(snapshot.durationMonthsAverage)}
          icon={<Calendar size={13} />}
          onClick={() =>
            setDrawer({
              metric: "duration_months",
              label: "Duración media (meses)",
              formatValue: (v) => `${v.toFixed(1)} meses`,
            })
          }
        />
        <DashboardKPITile
          label="LTV"
          value={formatMoneyOrDash(snapshot.ltv)}
          hint={ltvHint}
          icon={<TrendingUp size={13} />}
          onClick={() =>
            setDrawer({
              metric: "ltv",
              label: "LTV (asume retención total)",
              formatValue: (v) => formatMoney(v),
            })
          }
        />
        <DashboardKPITile
          label="Oportunidades up/cross"
          value={formatInteger(snapshot.opportunitiesCount)}
          hint="en período seleccionado"
          icon={<Sparkles size={13} />}
        />
      </div>

      <div className="mt-6">
        <DashboardHealthDistribution
          distribution={snapshot.healthDistribution}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardIndustriesChart industries={snapshot.industries} />
        <DashboardSizesChart sizes={snapshot.sizes} />
      </div>

      <div className="mt-6">
        <DashboardTopAccountsTable rows={snapshot.topActivity} />
      </div>

      <DashboardMetricDrawer
        metric={drawer?.metric ?? null}
        metricLabel={drawer?.label ?? null}
        period={period}
        formatValue={drawer?.formatValue ?? ((v) => String(v))}
        onClose={() => setDrawer(null)}
      />
    </>
  );
}
