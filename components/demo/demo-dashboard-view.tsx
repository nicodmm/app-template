"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Briefcase,
  Wallet,
  Coins,
  Calendar,
  TrendingUp,
  Sparkles,
  X,
  ChevronRight,
} from "lucide-react";
import { DashboardKPITile } from "@/components/dashboard-kpi-tile";
import { DashboardHealthDistribution } from "@/components/dashboard-health-distribution";
import { DashboardIndustriesChart } from "@/components/dashboard-industries-chart";
import { DashboardSizesChart } from "@/components/dashboard-sizes-chart";
import { DashboardTopAccountsTable } from "@/components/dashboard-top-accounts-table";
import { cn } from "@/lib/utils";
import type {
  DashboardSnapshot,
  DashboardBreakdown,
  DashboardBreakdownRow,
  DashboardMetricKey,
  HealthBucket,
  AccountsListRow,
} from "@/lib/queries/dashboard";

interface Props {
  snapshot: DashboardSnapshot;
  breakdown: DashboardBreakdown;
  resolveAccountsList: (
    filterType: "health" | "industry" | "size" | "opportunities",
    filterValue: string
  ) => AccountsListRow[];
}

interface OpenMetricDrawer {
  metric: DashboardMetricKey;
  label: string;
  formatValue: (value: number) => string;
}
interface OpenAccountsDrawer {
  filterType: "health" | "industry" | "size" | "opportunities";
  filterValue: string;
  title: string;
}

const HEALTH_LABEL: Record<HealthBucket, string> = {
  green: "Al día",
  yellow: "Atención",
  red: "En riesgo",
  inactive: "Sin actividad",
};

const HEALTH_PILL: Record<HealthBucket, { label: string; cls: string }> = {
  green: {
    label: "Al día",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  yellow: {
    label: "Atención",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  red: {
    label: "En riesgo",
    cls: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  inactive: {
    label: "Sin actividad",
    cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  },
};

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

export function DemoDashboardView({
  snapshot,
  breakdown,
  resolveAccountsList,
}: Props) {
  const [metricDrawer, setMetricDrawer] = useState<OpenMetricDrawer | null>(
    null
  );
  const [accountsDrawer, setAccountsDrawer] =
    useState<OpenAccountsDrawer | null>(null);

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
          hint="cuentas con señales activas"
          icon={<Sparkles size={13} />}
          onClick={() =>
            setAccountsDrawer({
              filterType: "opportunities",
              filterValue: "_",
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
              filterType: "health",
              filterValue: bucket,
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
              filterType: "industry",
              filterValue: value,
              title: `Industria — ${value}`,
            })
          }
        />
        <DashboardSizesChart
          sizes={snapshot.sizes}
          onSegmentClick={(value) =>
            setAccountsDrawer({
              filterType: "size",
              filterValue: value,
              title: `Tamaño — ${value}`,
            })
          }
        />
      </div>

      {metricDrawer && (
        <DemoMetricDrawer
          metricLabel={metricDrawer.label}
          breakdown={breakdown}
          formatValue={metricDrawer.formatValue}
          onClose={() => setMetricDrawer(null)}
        />
      )}
      {accountsDrawer && (
        <DemoAccountsListDrawer
          title={accountsDrawer.title}
          filterType={accountsDrawer.filterType}
          rows={resolveAccountsList(
            accountsDrawer.filterType,
            accountsDrawer.filterValue
          )}
          onClose={() => setAccountsDrawer(null)}
        />
      )}
    </>
  );
}

interface DemoMetricDrawerProps {
  metricLabel: string;
  breakdown: DashboardBreakdown;
  formatValue: (v: number) => string;
  onClose: () => void;
}

function DemoMetricDrawer({
  metricLabel,
  breakdown,
  formatValue,
  onClose,
}: DemoMetricDrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Detalle de ${metricLabel}`}
        className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col [background:var(--glass-bg)] backdrop-blur-[18px] [border-left:1px_solid_var(--glass-border)] [box-shadow:-12px_0_32px_-12px_rgba(0,0,0,0.18)]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 [border-bottom:1px_solid_var(--glass-border)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Desglose
            </p>
            <h2 className="text-base font-semibold">{metricLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-accent transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4 space-y-6">
          <BreakdownSection
            title="Por servicio"
            rows={breakdown.byService}
            formatValue={formatValue}
          />
          <BreakdownSection
            title="Por industria"
            rows={breakdown.byIndustry}
            formatValue={formatValue}
          />
          <BreakdownSection
            title="Por tamaño"
            rows={breakdown.bySize}
            formatValue={formatValue}
          />
          {breakdown.byOwner.length > 0 && (
            <BreakdownSection
              title="Por responsable"
              rows={breakdown.byOwner}
              formatValue={formatValue}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function BreakdownSection({
  title,
  rows,
  formatValue,
}: {
  title: string;
  rows: DashboardBreakdownRow[];
  formatValue: (value: number) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li
            key={`${title}-${r.label}`}
            className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <div>
              <span>{r.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {r.accountsCount} cuenta{r.accountsCount !== 1 ? "s" : ""}
              </span>
            </div>
            <span className="font-semibold tabular-nums">
              {formatValue(r.value)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface DemoAccountsListDrawerProps {
  title: string;
  filterType: "health" | "industry" | "size" | "opportunities";
  rows: AccountsListRow[];
  onClose: () => void;
}

function DemoAccountsListDrawer({
  title,
  filterType,
  rows,
  onClose,
}: DemoAccountsListDrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Cuentas — ${title}`}
        className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col [background:var(--glass-bg)] backdrop-blur-[18px] [border-left:1px_solid_var(--glass-border)] [box-shadow:-12px_0_32px_-12px_rgba(0,0,0,0.18)]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 [border-bottom:1px_solid_var(--glass-border)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cuentas
            </p>
            <h2 className="text-base font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-accent transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay cuentas en este segmento.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md px-3 py-2.5 text-sm [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
                >
                  <Link
                    href={`/demo/accounts/${r.id}`}
                    className="group flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium group-hover:text-primary transition-colors truncate">
                          {r.name}
                        </span>
                        {r.healthSignal && filterType !== "health" && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              HEALTH_PILL[r.healthSignal].cls
                            )}
                          >
                            {HEALTH_PILL[r.healthSignal].label}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          {r.serviceScope
                            ? r.serviceScope
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .join(" · ")
                            : "Sin servicio"}
                        </span>
                        <span>{r.ownerName ?? "Sin responsable"}</span>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="shrink-0 mt-1 text-muted-foreground group-hover:text-primary transition-colors"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

