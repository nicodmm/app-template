"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const data = [
  { dia: "Lun", cariño: 72, buenaOnda: 60 },
  { dia: "Mar", cariño: 78, buenaOnda: 66 },
  { dia: "Mié", cariño: 85, buenaOnda: 71 },
  { dia: "Jue", cariño: 82, buenaOnda: 75 },
  { dia: "Vie", cariño: 90, buenaOnda: 82 },
  { dia: "Sáb", cariño: 96, buenaOnda: 90 },
  { dia: "Dom", cariño: 100, buenaOnda: 98 },
];

export function VictorTqmDemo() {
  return (
    <div className="rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-card to-primary/10 p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent">
          Victor TQM 💙
        </h2>
        <span className="text-xs text-muted-foreground">Métrica oficial de primo</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Evolución semanal del nivel de cariño primo-céntrico (unidades arbitrarias pero verdaderas).
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--muted-foreground)" fontSize={12} domain={[0, 110]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Line
              type="monotone"
              dataKey="cariño"
              stroke="var(--primary)"
              strokeWidth={3}
              dot={{ r: 5 }}
              activeDot={{ r: 7 }}
              name="Cariño"
            />
            <Line
              type="monotone"
              dataKey="buenaOnda"
              stroke="#ec4899"
              strokeWidth={3}
              dot={{ r: 5 }}
              activeDot={{ r: 7 }}
              name="Buena onda"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
