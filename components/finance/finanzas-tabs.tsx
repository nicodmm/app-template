"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FxEditor } from "@/components/finance/fx-editor";
import { BillingList } from "@/components/finance/billing-list";
import { HonorariosAdmin } from "@/components/finance/honorarios-admin";
import type {
  BillingRow,
  FxRateRow,
  BillingHistoryRow,
  LtvRow,
  FinanceAccountOption,
  HonorarioRow,
  CompensationRow,
} from "@/lib/queries/finance";

interface Props {
  year: number;
  month: number;
  billing: BillingRow[];
  rates: FxRateRow[];
  history: BillingHistoryRow[];
  ltv: LtvRow[];
  accounts: FinanceAccountOption[];
  honorarios: HonorarioRow[];
  compensationRows: CompensationRow[];
  members: Array<{ userId: string; name: string }>;
  initialTab?: TabId;
}

type TabId = "billing" | "fx" | "honorarios";

const TABS: { id: TabId; label: string }[] = [
  { id: "billing", label: "A facturar" },
  { id: "fx", label: "TC / IPC" },
  { id: "honorarios", label: "Honorarios" },
];

export function FinanzasTabs({
  year,
  month,
  billing,
  rates,
  history,
  ltv,
  accounts,
  honorarios,
  compensationRows,
  members,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<TabId>(initialTab ?? "billing");

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Vistas de finanzas"
        className="inline-flex gap-1 rounded-lg p-1 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary/10 text-foreground [box-shadow:inset_0_0_0_1px_var(--glass-border)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/40 dark:hover:bg-white/5"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "billing" && (
        <BillingList
          year={year}
          month={month}
          billing={billing}
          history={history}
          ltv={ltv}
          accounts={accounts}
        />
      )}
      {tab === "fx" && <FxEditor rates={rates} />}
      {tab === "honorarios" && (
        <HonorariosAdmin
          rows={honorarios}
          compensationRows={compensationRows}
          members={members}
          year={year}
          month={month}
        />
      )}
    </div>
  );
}
