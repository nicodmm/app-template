import Link from "next/link";
import { Briefcase, Users, Clock, ArrowRight } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { getSelectionKpis } from "@/lib/queries/selection";

const TILE_CLASS =
  "rounded-lg p-3 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]";

export async function SelectionSection({ accountId }: { accountId: string }) {
  const kpis = await getSelectionKpis(accountId);

  const items = [
    { label: "Búsquedas activas", value: kpis.activeSearches, Icon: Briefcase },
    { label: "Candidatos", value: kpis.totalCandidates, Icon: Users },
    { label: "Pendientes de feedback", value: kpis.pendingFeedback, Icon: Clock },
  ] as const;

  return (
    <CollapsibleSection
      title="Selección"
      icon={<Briefcase size={16} aria-hidden />}
      summary={`${kpis.activeSearches} activas · ${kpis.totalCandidates} candidatos`}
    >
      <div className="space-y-3">
        <div className="flex justify-end">
          <Link
            href={`/app/accounts/${accountId}/selection`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Gestionar <ArrowRight size={11} aria-hidden />
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {items.map(({ label, value, Icon }) => (
            <div key={label} className={TILE_CLASS}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className="text-lg font-semibold font-mono tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}
