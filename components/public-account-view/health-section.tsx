import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ createdAt: Date; healthSignal: string }>;
}

const COLOR: Record<string, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#dc2626",
  inactive: "#94a3b8",
};

export function HealthSection({ rows }: Props) {
  if (rows.length === 0) return null;
  const sorted = [...rows].reverse();
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Evolución de la cuenta</h2>
      <div className="flex items-end gap-1 h-12">
        {sorted.map((r, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              backgroundColor: COLOR[r.healthSignal] ?? COLOR.inactive,
              height: "100%",
            }}
            title={new Date(r.createdAt).toLocaleDateString("es-AR")}
          />
        ))}
      </div>
    </GlassCard>
  );
}
