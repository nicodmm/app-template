import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  data: { pipeline: string | null; stage: string | null };
}

export function CrmSection({ data }: Props) {
  if (!data.pipeline && !data.stage) return null;
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">CRM</h2>
      <p className="text-sm">
        {data.pipeline && (
          <>
            Pipeline: <strong>{data.pipeline}</strong>
          </>
        )}
        {data.pipeline && data.stage && " · "}
        {data.stage && (
          <>
            Etapa: <strong>{data.stage}</strong>
          </>
        )}
      </p>
    </GlassCard>
  );
}
