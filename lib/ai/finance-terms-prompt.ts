export interface TermsContext {
  accountName: string;
  neuronasContratadas: string[];
  kickoffDate: string | null;
  baseFee: string | null;
  consultants: Array<{ name: string; neurona: string | null }>;
  rawText: string;
}

export const FINANCE_TERMS_SYSTEM = `Sos un asistente de administración financiera para una agencia de consultoría con varias "neuronas" (servicios). Tu tarea es convertir la descripción en lenguaje natural de las condiciones comerciales de un proyecto en una estructura JSON.

Reglas:
- Un proyecto puede tener varias neuronas en simultáneo y los fees pueden variar mes a mes.
- Para cada neurona producí un "engagement" con: moneda (USD o ARS), regla de facturación (same | mep | mep_ipc), y una lista de períodos {fromMonth (1 = primer mes), toMonth (null = en adelante), fee, currency}.
- El reparto a consultores ("shares"): type "percent" (porcentaje del fee, 0-100) o "fixed" (monto en una moneda). Referenciá al consultor por nombre tal cual aparezca.
- "Gastos adicionales" → additionalCharges: {concept, amount, currency, month (null = único/este mes), recurring}.
- Si un dato no está, omitilo o usá null. No inventes montos.
- Respondé SOLO con el JSON válido, sin texto extra ni markdown.`;

export function buildTermsUserMessage(ctx: TermsContext): string {
  const parts: string[] = [];
  parts.push(`Proyecto/cliente: ${ctx.accountName}`);
  if (ctx.neuronasContratadas.length) parts.push(`Neuronas contratadas: ${ctx.neuronasContratadas.join(", ")}`);
  if (ctx.kickoffDate) parts.push(`Kick off: ${ctx.kickoffDate}`);
  if (ctx.baseFee) parts.push(`Fee base de referencia: ${ctx.baseFee}`);
  if (ctx.consultants.length) parts.push(`Consultores del proyecto: ${ctx.consultants.map((c) => (c.neurona ? `${c.name} (${c.neurona})` : c.name)).join(", ")}`);
  parts.push(`Condiciones (lenguaje natural):\n${ctx.rawText}`);
  parts.push(`Devolvé el JSON con esta forma exacta: { "engagements": [{ "neurona": string, "currency": "USD"|"ARS", "billingRule": "same"|"mep"|"mep_ipc", "periods": [{ "fromMonth": number, "toMonth": number|null, "fee": number, "currency": "USD"|"ARS" }], "shares": [{ "consultantName": string, "type": "percent"|"fixed", "value": number, "currency": "USD"|"ARS"|null }] }], "additionalCharges": [{ "concept": string, "amount": number, "currency": "USD"|"ARS", "month": number|null, "recurring": boolean }], "notes": string|null }`);
  return parts.join("\n\n");
}
