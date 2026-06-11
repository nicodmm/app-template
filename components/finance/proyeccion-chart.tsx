"use client";

interface Props {
  labels: string[];
  values: number[]; // MRR per projected month (already in display currency)
  breakeven: number;
  fmt: (n: number) => string;
}

const GOLD = "#e8b04b";
const POS = "#46c69a";
const NEG = "#f0656a";
const BLUE = "#5b9ddb";

export function ProyeccionChart({ labels, values, breakeven, fmt }: Props) {
  const W = 960;
  const H = 300;
  const pl = 54;
  const pr = 16;
  const pt = 16;
  const pb = 38;
  const iw = W - pl - pr;
  const ih = H - pt - pb;

  const allv = [...values, breakeven, 0];
  const maxv = Math.max(...allv) * 1.08 || 1;
  const minv = 0;
  const n = labels.length;
  const X = (i: number) => pl + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v: number) => pt + ih - ((v - minv) / (maxv - minv)) * ih;
  const step = maxv > 110000 ? 25000 : maxv > 60000 ? 15000 : 10000;

  const gridlines: number[] = [];
  for (let gv = 0; gv <= maxv; gv += step) gridlines.push(gv);

  let line = "";
  let area = `M${X(0)} ${Y(0)} `;
  values.forEach((v, i) => {
    line += `${i ? "L" : "M"}${X(i)} ${Y(v)} `;
    area += `L${X(i)} ${Y(v)} `;
  });
  if (values.length) area += `L${X(values.length - 1)} ${Y(0)} Z`;
  const everyN = n > 8 ? 3 : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      fontFamily="var(--font-geist-mono, monospace)"
    >
      {gridlines.map((gv) => (
        <g key={`g${gv}`}>
          <line x1={pl} y1={Y(gv)} x2={W - pr} y2={Y(gv)} stroke="rgba(255,255,255,.06)" />
          <text x={pl - 9} y={Y(gv) + 4} fill="#8b9bb2" fontSize="11" textAnchor="end">
            {Math.round(gv / 1000)}k
          </text>
        </g>
      ))}
      <line x1={pl} y1={Y(breakeven)} x2={W - pr} y2={Y(breakeven)} stroke={BLUE} strokeDasharray="6 5" strokeWidth="1.5" />
      <text x={W - pr} y={Y(breakeven) - 6} fill={BLUE} fontSize="11" textAnchor="end">
        breakeven {fmt(breakeven)}
      </text>
      {values.length > 0 && (
        <>
          <path d={area} fill="rgba(232,176,75,.10)" />
          <path d={line} fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinejoin="round" />
          {values.map((v, i) => (
            <g key={`p${i}`}>
              <circle cx={X(i)} cy={Y(v)} r="3.6" fill={v >= breakeven ? POS : NEG} stroke="#0b0e13" strokeWidth="1.5" />
              {(i % everyN === 0 || i === n - 1) && (
                <text x={X(i)} y={H - 11} fill="#8b9bb2" fontSize="10.5" textAnchor="middle">
                  {labels[i]}
                </text>
              )}
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
