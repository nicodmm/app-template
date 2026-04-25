import { Mic } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import type { LatestMeetingSummary } from "@/lib/queries/transcripts";

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface LastMeetingCardProps {
  summary: LatestMeetingSummary;
}

/**
 * Quick-glance summary of the last processed meeting. Shown above the
 * "Subir contexto" form so the user can refresh their head before the
 * next call without opening the full transcripts list.
 */
export function LastMeetingCard({ summary }: LastMeetingCardProps) {
  const date = summary.meetingDate ?? summary.createdAt;
  return (
    <GlassCard className="p-6 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mic size={14} aria-hidden />
        </span>
        <h2 className="font-semibold">Resumen de la última reunión</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDate(date)}
        </span>
      </div>
      <div className="text-sm text-foreground/90">
        <RichMarkdown text={summary.meetingSummary} />
      </div>
      {summary.fileName && (
        <p className="mt-3 text-[11px] text-muted-foreground/70 truncate">
          {summary.fileName}
        </p>
      )}
    </GlassCard>
  );
}
