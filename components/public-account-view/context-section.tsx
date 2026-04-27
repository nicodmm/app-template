import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  data: {
    goals: string | null;
    startDate: string | null;
    serviceScope: string | null;
    industry: string | null;
    location: string | null;
    companyDescription: string | null;
    websiteUrl: string | null;
    linkedinUrl: string | null;
  };
}

export function ContextSection({ data }: Props) {
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-4">Contexto</h2>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        {data.goals && (
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Objetivos
            </p>
            <p>{data.goals}</p>
          </div>
        )}
        {data.serviceScope && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Servicios
            </p>
            <p>{data.serviceScope}</p>
          </div>
        )}
        {data.startDate && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Desde
            </p>
            <p>
              {new Date(data.startDate).toLocaleDateString("es-AR", {
                year: "numeric",
                month: "long",
              })}
            </p>
          </div>
        )}
        {data.location && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Ubicación
            </p>
            <p>{data.location}</p>
          </div>
        )}
        {data.companyDescription && (
          <p className="sm:col-span-2 text-muted-foreground pt-2 [border-top:1px_solid_var(--glass-border)]">
            {data.companyDescription}
          </p>
        )}
        {(data.websiteUrl || data.linkedinUrl) && (
          <div className="sm:col-span-2 flex gap-2 pt-2">
            {data.websiteUrl && (
              <a
                href={data.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                Web
              </a>
            )}
            {data.linkedinUrl && (
              <a
                href={data.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                LinkedIn
              </a>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
