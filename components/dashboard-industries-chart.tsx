"use client";

interface DashboardIndustriesChartProps {
  industries: Array<{ industry: string; count: number }>;
  onSegmentClick?: (industry: string) => void;
}

export function DashboardIndustriesChart({
  industries,
  onSegmentClick,
}: DashboardIndustriesChartProps) {
  const data = industries;
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <div className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h3 className="text-sm font-semibold mb-3">Industrias</h3>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos.</p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((row) => {
            const pct = max > 0 ? (row.count / max) * 100 : 0;
            const clickable = !!onSegmentClick;
            const RowTag = clickable ? "button" : "div";
            return (
              <li key={row.industry}>
                <RowTag
                  type={clickable ? "button" : undefined}
                  onClick={
                    clickable
                      ? () => onSegmentClick!(row.industry)
                      : undefined
                  }
                  className={`group flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors ${
                    clickable ? "cursor-pointer hover:bg-accent/40" : ""
                  }`}
                  title={row.industry}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-medium">
                      {row.industry}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {row.count}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </RowTag>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
