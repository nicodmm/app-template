import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ description: string; status: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
};

export function TasksSection({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-3">Tareas en curso</h2>
        <p className="text-sm text-muted-foreground">
          No hay tareas pendientes ahora mismo.
        </p>
      </GlassCard>
    );
  }
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Tareas en curso</h2>
      <ul className="space-y-2 text-sm">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3"
          >
            <span className="truncate">{r.description}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
