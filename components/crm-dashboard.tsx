// components/crm-dashboard.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { DateRangePicker, type DateRangePreset } from "@/components/ui/date-range-picker";
import { CrmSummaryTab } from "./crm-summary-tab";
import { CrmDealsTab } from "./crm-deals-tab";

const PRESETS: DateRangePreset[] = [
  { id: "7", label: "Últimos 7 días", days: 7 },
  { id: "30", label: "Últimos 30 días", days: 30 },
  { id: "90", label: "Últimos 90 días", days: 90 },
];
import type {
  CrmKpis,
  SourceBreakdownRow,
  CrmDealListRow,
  CrmFilterOptions,
  FunnelRow,
  CycleTimeStats,
  StalledDeal,
} from "@/lib/queries/crm";

interface Props {
  accountId: string;
  accountName: string;
  connection: {
    id: string;
    provider: string;
    externalCompanyDomain: string | null;
    status: "active" | "expired" | "revoked";
    lastSyncedAt: Date | null;
  };
  preset: "7" | "30" | "90" | "custom";
  since: string;
  until: string;
  tab: "resumen" | "deals";
  kpis: CrmKpis;
  breakdown: SourceBreakdownRow[];
  funnel: { rows: FunnelRow[]; wonInPeriod: number };
  cycleTime: CycleTimeStats;
  stalled: StalledDeal[];
  filterOptions: CrmFilterOptions;
  dealPage: { deals: CrmDealListRow[]; totalPages: number };
  page: number;
  status: "open" | "won" | "all";
  sourceIds: string[];
  stageIds: string[];
}

export function CrmDashboard(props: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function setTab(tab: "resumen" | "deals") {
    const next = new URLSearchParams(sp.toString());
    next.set("tab", tab);
    router.push(`?${next.toString()}`);
  }

  function setPreset(preset: DateRangePreset) {
    const next = new URLSearchParams(sp.toString());
    next.set("preset", preset.id);
    next.delete("since");
    next.delete("until");
    router.push(`?${next.toString()}`);
  }

  function applyCustom({ since, until }: { since: string; until: string }) {
    const next = new URLSearchParams(sp.toString());
    next.set("since", since);
    next.set("until", until);
    next.set("preset", "custom");
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link
        href={`/app/accounts/${props.accountId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ChevronLeft size={15} />
        {props.accountName}
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">CRM · {props.accountName}</h1>
          <p className="text-xs text-muted-foreground">
            Conectado a {props.connection.provider}
            {props.connection.externalCompanyDomain && ` · ${props.connection.externalCompanyDomain}`}
            {props.connection.lastSyncedAt && ` · última sync: ${new Date(props.connection.lastSyncedAt).toLocaleString("es-AR")}`}
          </p>
        </div>
        <Link
          href={`/app/accounts/${props.accountId}/crm/setup`}
          className="text-xs text-muted-foreground hover:underline"
        >
          Configurar
        </Link>
      </div>

      {props.connection.status !== "active" && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs">
          La conexión está {props.connection.status}. <Link className="underline" href={`/app/accounts/${props.accountId}/crm/setup`}>Reconectar</Link>.
        </div>
      )}

      <div className="flex items-center justify-end mb-4">
        <DateRangePicker
          presets={PRESETS}
          value={props.preset}
          customRange={
            props.preset === "custom"
              ? { since: props.since, until: props.until }
              : undefined
          }
          onPreset={setPreset}
          onCustom={applyCustom}
        />
      </div>

      <div className="flex gap-4 border-b border-border mb-4">
        <TabButton active={props.tab === "resumen"} onClick={() => setTab("resumen")}>
          Resumen
        </TabButton>
        <TabButton active={props.tab === "deals"} onClick={() => setTab("deals")}>
          Deals
        </TabButton>
      </div>

      {props.tab === "resumen" ? (
        <CrmSummaryTab
          kpis={props.kpis}
          breakdown={props.breakdown}
          funnel={props.funnel}
          cycleTime={props.cycleTime}
          stalled={props.stalled}
        />
      ) : (
        <CrmDealsTab
          filterOptions={props.filterOptions}
          dealPage={props.dealPage}
          page={props.page}
          status={props.status}
          sourceIds={props.sourceIds}
          stageIds={props.stageIds}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px px-2 py-2 text-sm font-medium border-b-2 ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
