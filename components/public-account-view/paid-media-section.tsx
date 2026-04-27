import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  data: {
    campaigns: Array<{ id: string; name: string; status: string }>;
    ads: Array<{
      id: string;
      campaignId: string;
      name: string;
      status: string;
      thumbnailUrl: string | null;
    }>;
    kpis: { spend: number; impressions: number; clicks: number };
  };
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function PaidMediaSection({ data }: Props) {
  if (data.campaigns.length === 0 && data.ads.length === 0) return null;
  return (
    <GlassCard className="p-6 space-y-4">
      <h2 className="font-semibold">Paid media (últimos 30 días)</h2>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Inversión</p>
          <p className="text-lg font-semibold">{formatMoney(data.kpis.spend)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Impresiones</p>
          <p className="text-lg font-semibold">
            {formatNumber(data.kpis.impressions)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Clicks</p>
          <p className="text-lg font-semibold">
            {formatNumber(data.kpis.clicks)}
          </p>
        </div>
      </div>
      {data.campaigns.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Campañas activas</h3>
          <ul className="space-y-1 text-sm">
            {data.campaigns
              .filter((c) => c.status === "ACTIVE")
              .map((c) => (
                <li key={c.id} className="truncate">
                  {c.name}
                </li>
              ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
