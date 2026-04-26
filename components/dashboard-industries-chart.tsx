"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DashboardIndustriesChartProps {
  industries: Array<{ industry: string; count: number }>;
}

export function DashboardIndustriesChart({
  industries,
}: DashboardIndustriesChartProps) {
  const data = industries.slice(0, 8);
  return (
    <div className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h3 className="text-sm font-semibold mb-3">Industrias</h3>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos.</p>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(160, data.length * 28)}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="industry"
              width={120}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
              }}
            />
            <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
