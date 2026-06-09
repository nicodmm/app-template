import { Mic } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { getLatestMeetingSummary } from "@/lib/queries/transcripts";

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function LastMeetingSection({ accountId }: { accountId: string }) {
  const summary = await getLatestMeetingSummary(accountId);
  if (!summary) return null;

  const date = summary.meetingDate ?? summary.createdAt;

  return (
    <CollapsibleSection
      title="Resumen de la última reunión"
      icon={<Mic size={16} aria-hidden />}
      summary={formatDate(date)}
    >
      <div className="text-sm text-foreground/90">
        <RichMarkdown text={summary.meetingSummary} />
      </div>
      {summary.fileName && (
        <p className="mt-3 text-[11px] text-muted-foreground/70 truncate">
          {summary.fileName}
        </p>
      )}
    </CollapsibleSection>
  );
}
