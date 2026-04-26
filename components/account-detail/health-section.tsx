import { TrendingUp } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { HealthHistoryTimeline } from "@/components/health-history-timeline";
import { getAccountHealthHistory } from "@/lib/queries/signals";

export async function HealthSection({ accountId }: { accountId: string }) {
  const entries = await getAccountHealthHistory(accountId);
  const healthChanges = entries.reduce(
    (acc, e, i) =>
      acc +
      (!entries[i + 1] || entries[i + 1].healthSignal !== e.healthSignal
        ? 1
        : 0),
    0
  );

  return (
    <CollapsibleSection
      id="salud-section"
      title="Evolución de salud"
      icon={<TrendingUp size={16} aria-hidden />}
      defaultOpen
      summary={
        entries.length === 0
          ? "sin historial"
          : `${healthChanges} cambio${healthChanges !== 1 ? "s" : ""} de estado`
      }
    >
      <HealthHistoryTimeline entries={entries} />
    </CollapsibleSection>
  );
}
