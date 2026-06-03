"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FxEditor } from "@/components/finance/fx-editor";
import { BillingList } from "@/components/finance/billing-list";
import type {
  BillingRow,
  FxRateRow,
  BillingHistoryRow,
  LtvRow,
  FinanceAccountOption,
} from "@/lib/queries/finance";

interface Props {
  year: number;
  month: number;
  billing: BillingRow[];
  rates: FxRateRow[];
  history: BillingHistoryRow[];
  ltv: LtvRow[];
  accounts: FinanceAccountOption[];
}

type TabId = "billing" | "fx";
// Task 15 adds a "honorarios" member view tab here.
// const TABS: { id: TabId; label: string }[] = [..., { id: "honorarios", label: "Mis honorarios" }];

const TABS: { id: TabId; label: string }[] = [
  { id: "billing", label: "A facturar" },
  { id: "fx", label: "TC / IPC" },
];

export function FinanzasTabs({
  year,
  month,
  billing,
  rates,
  history,
  ltv,
  accounts,
}: Props) {
  const [tab, setTab] = useState<TabId>("billing");

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

      {tab === "billing" ? (
        <BillingList
          year={year}
          month={month}
          billing={billing}
          history={history}
          ltv={ltv}
          accounts={accounts}
        />
      ) : (
        <FxEditor rates={rates} />
      )}
    </div>
  );
}
