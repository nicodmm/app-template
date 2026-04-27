"use client";

import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import type { HealthBucket } from "@/lib/queries/dashboard";

const BUCKET_CONFIG: Record<
  HealthBucket,
  { label: string; fill: string }
> = {
  green: { label: "Al día", fill: "#10b981" },
  yellow: { label: "Atención", fill: "#f59e0b" },
  red: { label: "En riesgo", fill: "#dc2626" },
  inactive: { label: "Sin actividad", fill: "#94a3b8" },
};

interface TreemapDatum {
  name: string;
  bucket: HealthBucket;
  size: number;
  fill: string;
  [key: string]: unknown;
}

interface DashboardHealthDistributionProps {
  distribution: Record<HealthBucket, number>;
  onBucketClick?: (bucket: HealthBucket) => void;
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  fill?: string;
  bucket?: HealthBucket;
  onBucketClick?: (bucket: HealthBucket) => void;
}

function TreemapContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name,
  size,
  fill,
  bucket,
  onBucketClick,
}: TreemapContentProps) {
  const showLabel = width > 60 && height > 32;
  const handle = () => {
    if (bucket && onBucketClick) onBucketClick(bucket);
  };
  // Round positions to integers — Recharts hands us floats which trigger
  // sub-pixel anti-aliasing and make the SVG <text> look blurry on fills.
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.round(width);
  const rh = Math.round(height);
  return (
    <g
      onClick={handle}
      style={{ cursor: bucket && onBucketClick ? "pointer" : "default" }}
    >
      <rect
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        fill={fill}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={2}
        rx={6}
      />
      {showLabel && (
        <>
          <text
            x={rx + 12}
            y={ry + 20}
            fill="#ffffff"
            fontSize={12}
            fontWeight={600}
            fontFamily="var(--font-geist-sans), system-ui, sans-serif"
            style={{ textRendering: "geometricPrecision" }}
          >
            {name}
          </text>
          <text
            x={rx + 12}
            y={ry + 42}
            fill="#ffffff"
            fontSize={20}
            fontWeight={700}
            fontFamily="var(--font-geist-sans), system-ui, sans-serif"
            style={{ textRendering: "geometricPrecision" }}
          >
            {size}
          </text>
        </>
      )}
    </g>
  );
}

export function DashboardHealthDistribution({
  distribution,
  onBucketClick,
}: DashboardHealthDistributionProps) {
  const order: HealthBucket[] = ["green", "yellow", "red", "inactive"];
  const data: TreemapDatum[] = order
    .map((bucket) => ({
      name: BUCKET_CONFIG[bucket].label,
      bucket,
      size: distribution[bucket],
      fill: BUCKET_CONFIG[bucket].fill,
    }))
    .filter((d) => d.size > 0);
  const total = data.reduce((acc, d) => acc + d.size, 0);

  return (
    <div className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Salud del portfolio</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {total} cuenta{total !== 1 ? "s" : ""}
        </span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">Sin cuentas activas.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <Treemap
            data={data}
            dataKey="size"
            stroke="rgba(255,255,255,0.6)"
            content={(props: TreemapContentProps) => (
              <TreemapContent {...props} onBucketClick={onBucketClick} />
            )}
            isAnimationActive={false}
          >
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      )}
    </div>
  );
}
