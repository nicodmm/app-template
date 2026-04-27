import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ title: string; docType: string; createdAt: Date }>;
}

export function FilesSection({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-3">Archivos</h2>
        <p className="text-sm text-muted-foreground">
          Tu equipo todavía no subió documentos de contexto.
        </p>
      </GlassCard>
    );
  }
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Archivos</h2>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li
            key={`${r.title}-${r.createdAt.toISOString()}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="truncate">{r.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(r.createdAt).toLocaleDateString("es-AR")}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
