import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{
    name: string;
    role: string | null;
    isAgencyTeam: boolean;
  }>;
}

export function ParticipantsSection({ rows }: Props) {
  if (rows.length === 0) return null;
  // Agency people first (they're the ones the client recognizes from
  // meetings as "their team"), then everyone else.
  const sorted = [...rows].sort((a, b) => {
    if (a.isAgencyTeam === b.isAgencyTeam) return 0;
    return a.isAgencyTeam ? -1 : 1;
  });
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Participantes</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {sorted.map((r, i) => (
          <li
            key={`${r.name}-${i}`}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <span className="font-medium">{r.name}</span>
            {r.role && (
              <span
                className={
                  r.isAgencyTeam
                    ? "text-xs text-primary"
                    : "text-xs text-muted-foreground"
                }
              >
                {r.role}
              </span>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
