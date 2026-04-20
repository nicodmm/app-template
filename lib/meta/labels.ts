export function getPaidMediaLabels(isEcommerce: boolean) {
  return {
    spend: "Inversión",
    conversions: isEcommerce ? "Ventas" : "Leads",
    cpa: isEcommerce ? "CPA" : "CPL",
    impressions: "Impresiones",
    reach: "Alcance",
    clicks: "Clicks",
    ctr: "CTR",
    cpm: "CPM",
    frequency: "Frecuencia",
    roas: "ROAS",
    assetVariants: "Variantes por imagen",
    assetName: "Nombre",
  } as const;
}

export type PaidMediaLabels = ReturnType<typeof getPaidMediaLabels>;
