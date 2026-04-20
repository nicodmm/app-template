// components/crm-dashboard.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CrmSummaryTab } from "./crm-summary-tab";
import { CrmDealsTab } from "./crm-deals-tab";
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
  const [customOpen, setCustomOpen] = useState(props.preset === "custom");
  const [sinceDraft, setSinceDraft] = useState(props.since);
  const [untilDraft, setUntilDraft] = useState(props.until);

  function setTab(tab: "resumen" | "deals") {
    const next = new URLSearchParams(sp.toString());
    next.set("tab", tab);
    router.push(`?${next.toString()}`);
  }

  function setPreset(preset: "7" | "30" | "90") {
    const next = new URLSearchParams(sp.toString());
    next.set("preset", preset);
    next.delete("since");
    next.delete("until");
    setCustomOpen(false);
    router.push(`?${next.toString()}`);
  }

  function applyCustom() {
    if (!sinceDraft || !untilDraft) return;
    if (new Date(sinceDraft) > new Date(untilDraft)) return;
    const next = new URLSearchParams(sp.toString());
    next.set("since", sinceDraft);
    next.set("until", untilDraft);
    next.delete("preset");
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">CRM — {props.accountName}</h1>
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

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="inline-flex rounded-md border border-border">
          {(["7", "30", "90"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1 text-xs ${props.preset === p ? "bg-accent" : "bg-transparent hover:bg-accent/30"}`}
            >
              {p}d
            </button>
          ))}
          <button
            onClick={() => setCustomOpen((v) => !v)}
            className={`px-3 py-1 text-xs border-l border-border ${
              props.preset === "custom" || customOpen
                ? "bg-accent"
                : "bg-transparent hover:bg-accent/30"
            }`}
          >
            Personalizado
          </button>
        </div>
        {customOpen && (
          <div className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1">
            <input
              type="date"
              value={sinceDraft}
              onChange={(e) => setSinceDraft(e.target.value)}
              className="bg-transparent text-xs outline-none"
              max={untilDraft}
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date"
              value={untilDraft}
              onChange={(e) => setUntilDraft(e.target.value)}
              className="bg-transparent text-xs outline-none"
              min={sinceDraft}
              max={new Date().toISOString().slice(0, 10)}
            />
            <button
              type="button"
              onClick={applyCustom}
              className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary/90"
            >
              Aplicar
            </button>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {props.since} → {props.until}
        </div>
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
