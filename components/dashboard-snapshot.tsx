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
import { DashboardAccountsListDrawer } from "@/components/dashboard-accounts-list-drawer";
import type {
  AccountsListFilter,
  DashboardMetricKey,
  DashboardPeriod,
  DashboardSnapshot,
  HealthBucket,
} from "@/lib/queries/dashboard";

interface DashboardSnapshotViewProps {
  snapshot: DashboardSnapshot;
  period: DashboardPeriod;
  service: string | null;
  ownerId: string | null;
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

interface OpenMetricDrawer {
  metric: DashboardMetricKey;
  label: string;
  formatValue: (value: number) => string;
}

interface OpenAccountsDrawer {
  filter: AccountsListFilter;
  title: string;
}

const HEALTH_LABEL: Record<HealthBucket, string> = {
  green: "Al día",
  yellow: "Atención",
  red: "En riesgo",
  inactive: "Sin actividad",
};

export function DashboardSnapshotView({
  snapshot,
  period,
  service,
  ownerId,
}: DashboardSnapshotViewProps) {
  const [metricDrawer, setMetricDrawer] = useState<OpenMetricDrawer | null>(
    null
  );
  const [accountsDrawer, setAccountsDrawer] =
    useState<OpenAccountsDrawer | null>(null);

  const noFeeHint =
    snapshot.totalAccounts > 0 &&
    snapshot.accountsWithoutFee / snapshot.totalAccounts > 0.25
      ? `${snapshot.accountsWithoutFee} sin fee no incluidas`
      : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardKPITile
          label="Clientes activos"
          value={formatInteger(snapshot.totalAccounts)}
          icon={<Briefcase size={13} />}
          onClick={() =>
            setMetricDrawer({
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
            setMetricDrawer({
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
            setMetricDrawer({
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
            setMetricDrawer({
              metric: "duration_months",
              label: "Duración media (meses)",
              formatValue: (v) => `${v.toFixed(1)} meses`,
            })
          }
        />
        <DashboardKPITile
          label="LTV"
          value={formatMoneyOrDash(snapshot.ltv)}
          icon={<TrendingUp size={13} />}
          onClick={() =>
            setMetricDrawer({
              metric: "ltv",
              label: "LTV",
              formatValue: (v) => formatMoney(v),
            })
          }
        />
        <DashboardKPITile
          label="Oportunidades up/cross"
          value={formatInteger(snapshot.opportunitiesCount)}
          hint="en período seleccionado"
          icon={<Sparkles size={13} />}
          onClick={() =>
            setAccountsDrawer({
              filter: { type: "opportunities" },
              title: "Oportunidades up/cross",
            })
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardHealthDistribution
          distribution={snapshot.healthDistribution}
          onBucketClick={(bucket) =>
            setAccountsDrawer({
              filter: { type: "health", bucket },
              title: `Salud — ${HEALTH_LABEL[bucket]}`,
            })
          }
        />
        <DashboardTopAccountsTable rows={snapshot.topActivity} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardIndustriesChart
          industries={snapshot.industries}
          onSegmentClick={(value) =>
            setAccountsDrawer({
              filter: { type: "industry", value },
              title: `Industria — ${value}`,
            })
          }
        />
        <DashboardSizesChart
          sizes={snapshot.sizes}
          onSegmentClick={(value) =>
            setAccountsDrawer({
              filter: { type: "size", value },
              title: `Tamaño — ${value}`,
            })
          }
        />
      </div>

      <DashboardMetricDrawer
        metric={metricDrawer?.metric ?? null}
        metricLabel={metricDrawer?.label ?? null}
        period={period}
        formatValue={metricDrawer?.formatValue ?? ((v) => String(v))}
        onClose={() => setMetricDrawer(null)}
      />
      <DashboardAccountsListDrawer
        filter={accountsDrawer?.filter ?? null}
        title={accountsDrawer?.title ?? null}
        period={period}
        service={service}
        ownerId={ownerId}
        onClose={() => setAccountsDrawer(null)}
      />
    </>
  );
}
