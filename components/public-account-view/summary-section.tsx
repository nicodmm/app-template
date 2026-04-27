import { GlassCard } from "@/components/ui/glass-card";
import { RichMarkdown } from "@/components/ui/rich-markdown";

interface Props {
  clientSummary: string | null;
}

export function SummarySection({ clientSummary }: Props) {
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Resumen</h2>
      {clientSummary ? (
        <div className="text-sm">
          <RichMarkdown text={clientSummary} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Estamos preparando el resumen de tu cuenta. Volvé en unos minutos.
        </p>
      )}
    </GlassCard>
  );
}
