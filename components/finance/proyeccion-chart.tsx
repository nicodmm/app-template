"use client";

import { useState } from "react";

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

/** A "nice" axis step (1/2/5 × 10ⁿ) so we land on ~`target` gridlines at any magnitude. */
function niceStep(max: number, target = 5): number {
  if (max <= 0) return 1;
  const raw = max / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

/** Compact axis label: 9.400.000 → "9,4M", 25000 → "25k". */
function axisLabel(v: number): string {
  if (Math.abs(v) >= 1_000_000) {
    return `${(v / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
  }
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

export function ProyeccionChart({ labels, values, breakeven, fmt }: Props) {
  const [hover, setHover] = useState<number | null>(null);

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
  const step = niceStep(maxv);

  const gridlines: number[] = [];
  for (let gv = 0; gv <= maxv && gridlines.length < 12; gv += step) gridlines.push(gv);

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
            {axisLabel(gv)}
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
              <circle
                cx={X(i)}
                cy={Y(v)}
                r={hover === i ? "5.2" : "3.6"}
                fill={v >= breakeven ? POS : NEG}
                stroke="#0b0e13"
                strokeWidth="1.5"
                style={{ cursor: "pointer", transition: "r .1s" }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              />
              {/* Invisible larger hit-area so the tooltip is easy to trigger. */}
              <circle
                cx={X(i)}
                cy={Y(v)}
                r="14"
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              />
              {(i % everyN === 0 || i === n - 1) && (
                <text x={X(i)} y={H - 11} fill="#8b9bb2" fontSize="10.5" textAnchor="middle">
                  {labels[i]}
                </text>
              )}
            </g>
          ))}
          {/* Tooltip for the hovered point. */}
          {hover !== null && values[hover] !== undefined && (
            <g pointerEvents="none">
              {(() => {
                const cx = X(hover);
                const cy = Y(values[hover]);
                const text = `${labels[hover]}  ${fmt(values[hover])}`;
                const w = Math.max(64, text.length * 6.6 + 16);
                const boxX = Math.min(Math.max(cx - w / 2, pl), W - pr - w);
                const boxY = cy - 34 < pt ? cy + 12 : cy - 34;
                return (
                  <>
                    <rect
                      x={boxX}
                      y={boxY}
                      width={w}
                      height={22}
                      rx={5}
                      fill="#0b0e13"
                      stroke={GOLD}
                      strokeWidth="1"
                      opacity="0.95"
                    />
                    <text
                      x={boxX + w / 2}
                      y={boxY + 15}
                      fill="#e7edf5"
                      fontSize="11"
                      textAnchor="middle"
                    >
                      {text}
                    </text>
                  </>
                );
              })()}
            </g>
          )}
        </>
      )}
    </svg>
  );
}
