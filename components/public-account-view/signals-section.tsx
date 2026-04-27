import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ type: string; description: string | null; createdAt: Date }>;
}

const TYPE_LABEL: Record<string, string> = {
  upsell_opportunity: "Oportunidad de upsell",
  growth_opportunity: "Oportunidad de crecimiento",
};

export function SignalsSection({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Oportunidades detectadas</h2>
      <ul className="space-y-3 text-sm">
        {rows.map((r, i) => (
          <li key={i}>
            <p className="font-medium">{TYPE_LABEL[r.type] ?? r.type}</p>
            {r.description && (
              <p className="text-muted-foreground">{r.description}</p>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
