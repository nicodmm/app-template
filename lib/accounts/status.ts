export type AccountStatus = "active" | "inactive" | "finished";

export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  finished: "Finalizado",
};

/** Estado de ciclo de vida derivado de closedAt + closeReason. */
export function accountStatus(a: {
  closedAt: Date | null;
  closeReason: string | null;
}): AccountStatus {
  if (a.closedAt == null) return "active";
  return a.closeReason === "inactive" ? "inactive" : "finished";
}
