import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ name: string; role: string | null }>;
}

export function ParticipantsSection({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Participantes</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="font-medium">{r.name}</span>
            {r.role && (
              <span className="text-xs text-muted-foreground">{r.role}</span>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
