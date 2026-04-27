import { FileText, FolderOpen } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{
    title: string;
    kind: "document" | "meeting";
    docType: string | null;
    meetingDate: Date | null;
    createdAt: Date;
  }>;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  note: "Nota",
  presentation: "Presentación",
  report: "Reporte",
  spreadsheet: "Planilla",
  other: "Documento",
};

function formatDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FilesSection({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-3">Archivos y reuniones</h2>
        <p className="text-sm text-muted-foreground">
          Tu equipo todavía no compartió documentos ni reuniones acá.
        </p>
      </GlassCard>
    );
  }
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Archivos y reuniones</h2>
      <ul className="space-y-2 text-sm">
        {rows.map((r, i) => {
          const Icon = r.kind === "meeting" ? FileText : FolderOpen;
          const subtitle =
            r.kind === "meeting"
              ? "Reunión"
              : DOC_TYPE_LABEL[r.docType ?? "other"] ?? "Documento";
          return (
            <li
              key={`${r.title}-${i}`}
              className="flex items-start justify-between gap-3 rounded-md px-3 py-2 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
            >
              <div className="flex items-start gap-2 min-w-0">
                <Icon
                  size={13}
                  className="text-muted-foreground shrink-0 mt-0.5"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                {formatDate(r.meetingDate ?? r.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
