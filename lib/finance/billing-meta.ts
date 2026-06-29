/**
 * Constantes compartidas (client-safe) del estado de facturación y el centro de
 * costos. Sin imports de servidor: lo usan tanto los Server Actions/queries como
 * los componentes cliente de la UI de Finanzas.
 */

/** Estado de la factura, a nivel cuenta/mes. Orden de flujo de facturación. */
export const BILLING_STATUS_ORDER = [
  "pending",
  "billed",
  "payment_pending",
  "paid",
] as const;

export type BillingStatus = (typeof BILLING_STATUS_ORDER)[number];

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  pending: "Facturación Pendiente",
  billed: "Facturado",
  payment_pending: "Pago Pendiente",
  paid: "Pagado",
};

export function isBillingStatus(value: unknown): value is BillingStatus {
  return (
    typeof value === "string" &&
    (BILLING_STATUS_ORDER as readonly string[]).includes(value)
  );
}

/** Estado por defecto cuando una cuenta/mes todavía no tiene fila de estado. */
export const DEFAULT_BILLING_STATUS: BillingStatus = "pending";

export function billingStatusLabel(value: string | null | undefined): string {
  return isBillingStatus(value)
    ? BILLING_STATUS_LABELS[value]
    : BILLING_STATUS_LABELS[DEFAULT_BILLING_STATUS];
}

/** Centro de costos, a nivel concepto/línea de facturación. */
export const CENTRO_COSTOS_ORDER = [
  "sales",
  "marketing",
  "growth",
  "people",
  "innovacion",
  "otro",
] as const;

export type CentroCostos = (typeof CENTRO_COSTOS_ORDER)[number];

export const CENTRO_COSTOS_LABELS: Record<CentroCostos, string> = {
  sales: "Sales",
  marketing: "Marketing",
  growth: "Growth",
  people: "People",
  innovacion: "Innovación",
  otro: "Otro",
};

export function isCentroCostos(value: unknown): value is CentroCostos {
  return (
    typeof value === "string" &&
    (CENTRO_COSTOS_ORDER as readonly string[]).includes(value)
  );
}

export function centroCostosLabel(value: string | null | undefined): string {
  return isCentroCostos(value) ? CENTRO_COSTOS_LABELS[value] : "—";
}
