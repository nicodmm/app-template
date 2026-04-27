export interface ShareConfig {
  summary: boolean;
  context: boolean;
  lastMeeting: boolean;
  files: boolean;
  tasks: boolean;
  participants: boolean;
  signals: boolean;
  crm: boolean;
  health: boolean;
  paidMedia: boolean;
}

export const DEFAULT_SHARE_CONFIG: ShareConfig = {
  summary: true,
  context: false,
  lastMeeting: true,
  files: true,
  tasks: true,
  participants: true,
  signals: false,
  crm: false,
  health: false,
  paidMedia: true,
};

export function coerceShareConfig(
  raw: Record<string, boolean> | null | undefined
): ShareConfig {
  const out: ShareConfig = { ...DEFAULT_SHARE_CONFIG };
  if (!raw) return out;
  for (const k of Object.keys(out) as Array<keyof ShareConfig>) {
    if (typeof raw[k] === "boolean") out[k] = raw[k];
  }
  return out;
}

export const SHARE_CONFIG_LABELS: Record<keyof ShareConfig, string> = {
  summary: "Resumen IA",
  context: "Contexto (objetivos, fechas, links)",
  lastMeeting: "Última reunión",
  files: "Archivos de contexto",
  tasks: "Tareas",
  participants: "Participantes",
  signals: "Señales (solo positivas)",
  crm: "CRM",
  health: "Salud de la cuenta",
  paidMedia: "Paid media",
};
