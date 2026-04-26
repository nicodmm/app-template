import { Zap } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { SignalsPanel } from "@/components/signals-panel";
import { getAccountSignals } from "@/lib/queries/signals";

interface Props {
  accountId: string;
  hasAgencyContext: boolean;
}

export async function SignalsSection({ accountId, hasAgencyContext }: Props) {
  const signals = await getAccountSignals(accountId);
  const activeSignals = signals.filter((s) => s.status === "active").length;
  const resolvedSignals = signals.length - activeSignals;

  return (
    <CollapsibleSection
      title="Señales"
      icon={<Zap size={16} aria-hidden />}
      summary={
        signals.length === 0
          ? "sin señales"
          : `${activeSignals} activa${activeSignals !== 1 ? "s" : ""}${
              resolvedSignals > 0
                ? ` · ${resolvedSignals} resuelta${resolvedSignals !== 1 ? "s" : ""}`
                : ""
            }`
      }
    >
      <SignalsPanel
        signals={signals}
        accountId={accountId}
        hasAgencyContext={hasAgencyContext}
      />
    </CollapsibleSection>
  );
}
