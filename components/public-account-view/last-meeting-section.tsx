import { GlassCard } from "@/components/ui/glass-card";
import { RichMarkdown } from "@/components/ui/rich-markdown";

interface Props {
  data: {
    title: string;
    meetingDate: Date | null;
    meetingSummary: string | null;
  };
}

export function LastMeetingSection({ data }: Props) {
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-1">Última reunión</h2>
      <p className="text-xs text-muted-foreground mb-3">
        {data.title}
        {data.meetingDate && (
          <>
            {" · "}
            {new Date(data.meetingDate).toLocaleDateString("es-AR", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </>
        )}
      </p>
      {data.meetingSummary ? (
        <div className="text-sm">
          <RichMarkdown text={data.meetingSummary} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          El resumen de esta reunión todavía está procesándose.
        </p>
      )}
    </GlassCard>
  );
}
