import { FolderOpen } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { ContextFilesTimeline } from "@/components/context-files-timeline";
import { getTranscriptHistory } from "@/lib/queries/transcripts";
import { getAccountContextDocuments } from "@/lib/queries/context-documents";

export async function FilesSection({ accountId }: { accountId: string }) {
  const [transcripts, contextDocs] = await Promise.all([
    getTranscriptHistory(accountId, 50),
    getAccountContextDocuments(accountId, 50),
  ]);

  const total = transcripts.length + contextDocs.length;
  if (total === 0) return null;

  const ts = transcripts.length;
  const cs = contextDocs.length;
  const summary =
    ts > 0 && cs > 0
      ? `${total} (${ts} transcripción${ts !== 1 ? "es" : ""} · ${cs} archivo${cs !== 1 ? "s" : ""})`
      : ts > 0
        ? `${ts} transcripción${ts !== 1 ? "es" : ""}`
        : `${cs} archivo${cs !== 1 ? "s" : ""}`;

  return (
    <CollapsibleSection
      title="Archivos de contexto"
      icon={<FolderOpen size={16} aria-hidden />}
      summary={summary}
    >
      <ContextFilesTimeline
        transcripts={transcripts}
        contextDocs={contextDocs}
        accountId={accountId}
      />
    </CollapsibleSection>
  );
}
