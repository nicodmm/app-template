"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CampaignRow } from "@/lib/queries/paid-media";
import { PaidMediaCampaignDrawer } from "./paid-media-campaign-drawer";

type SortKey = keyof Pick<
  CampaignRow,
  "name" | "status" | "spend" | "impressions" | "ctr" | "cpc" | "conversions" | "cpa" | "frequency"
>;

interface PaidMediaCampaignsTableProps {
  campaigns: CampaignRow[];
  currency: string;
  isEcommerce: boolean;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PaidMediaCampaignsTable({
  campaigns,
  currency,
  isEcommerce,
}: PaidMediaCampaignsTableProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "PAUSED">("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const rows =
      statusFilter === "all" ? campaigns : campaigns.filter((c) => c.status === statusFilter);
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [campaigns, statusFilter, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  const Header = ({
    k,
    label,
    align = "left",
  }: {
    k: SortKey;
    label: string;
    align?: "left" | "right";
  }) => (
    <th className={`px-2 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {sortKey === k && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </button>
    </th>
  );

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "ACTIVE" | "PAUSED")}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">Todas</option>
          <option value="ACTIVE">Activas</option>
          <option value="PAUSED">Pausadas</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {filtered.length} campaña{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-muted/30 text-muted-foreground">
            <tr>
              <Header k="name" label="Campaña" />
              <Header k="status" label="Estado" />
              <Header k="spend" label="Spend" align="right" />
              <Header k="impressions" label="Impr." align="right" />
              <Header k="ctr" label="CTR" align="right" />
              <Header k="cpc" label="CPC" align="right" />
              <Header k="conversions" label="Conv." align="right" />
              <Header k="cpa" label={isEcommerce ? "CPA" : "CPL"} align="right" />
              <Header k="frequency" label="Freq" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <td className="px-2 py-2 max-w-[240px] truncate">{c.name}</td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      c.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">{formatMoney(c.spend, currency)}</td>
                <td className="px-2 py-2 text-right">{c.impressions.toLocaleString("es-AR")}</td>
                <td className="px-2 py-2 text-right">{c.ctr.toFixed(2)}%</td>
                <td className="px-2 py-2 text-right">
                  {c.clicks > 0 ? formatMoney(Math.round(c.cpc * 100), currency) : "—"}
                </td>
                <td className="px-2 py-2 text-right">{c.conversions}</td>
                <td className="px-2 py-2 text-right">
                  {c.conversions > 0 ? formatMoney(Math.round(c.cpa * 100), currency) : "—"}
                </td>
                <td className="px-2 py-2 text-right">{c.frequency.toFixed(2)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">
                  Sin campañas con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaidMediaCampaignDrawer
        campaign={selectedCampaign}
        currency={currency}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
