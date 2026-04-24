export const ACCOUNT_MODULES = [
  { key: "crm", label: "CRM (Pipedrive)", description: "Integración con Pipedrive" },
  { key: "paid_media", label: "Paid Media (Meta Ads)", description: "Conexión y reporte de Meta Ads" },
  { key: "context_upload", label: "Subir contexto", description: "Transcripciones, notas y archivos de contexto" },
  { key: "tasks", label: "Tareas", description: "Panel de tareas pendientes" },
  { key: "participants", label: "Contactos y participantes", description: "Contactos de la cuenta" },
  { key: "signals", label: "Señales", description: "Alertas y señales detectadas" },
  { key: "health", label: "Evolución de salud", description: "Timeline del estado de la cuenta" },
] as const;

export type AccountModuleKey = (typeof ACCOUNT_MODULES)[number]["key"];

export function isModuleEnabled(
  enabled: Partial<Record<AccountModuleKey, boolean>> | null | undefined,
  key: AccountModuleKey
): boolean {
  return enabled?.[key] !== false;
}

export function buildEnabledModulesFromForm(
  selectedKeys: string[]
): Partial<Record<AccountModuleKey, boolean>> {
  const out: Partial<Record<AccountModuleKey, boolean>> = {};
  for (const { key } of ACCOUNT_MODULES) {
    if (!selectedKeys.includes(key)) out[key] = false;
  }
  return out;
}
