export interface TermsContext {
  accountName: string;
  neuronasContratadas: string[];
  kickoffDate: string | null;
  baseFee: string | null;
  consultants: Array<{ name: string; neurona: string | null }>;
  rawText: string;
}

export const FINANCE_TERMS_SYSTEM = `Sos un asistente de administración financiera para una agencia de consultoría con varias "neuronas" (servicios). Tu tarea es convertir la descripción en lenguaje natural de las condiciones comerciales de un proyecto en una estructura JSON.

CONCEPTO CLAVE — el fee mensual es UN ÚNICO TOTAL:
- El cliente paga un fee mensual total (puede variar mes a mes). Los servicios/neuronas son la forma de REPARTIR ese total en conceptos; NO son cargos que se sumen encima del fee.
- Cada "engagement" representa UN concepto/servicio del fee. La SUMA de los fees de todos los engagements (de cada período) debe dar el fee mensual total. NUNCA repitas el fee total en cada engagement.
- Ejemplo: fee 1987, distribución 50% Marketing / 50% Growth → engagement "Marketing" fee 993.5 + engagement "Growth" fee 993.5 (suman 1987). NO pongas 1987 en cada uno.
- Si hay UN solo servicio (o no se indica reparto), un único engagement con el fee total, usando el nombre del servicio como neurona.
- Si los términos dan un cronograma del fee (ej: "primer mes 2000, a partir del segundo 2800"), eso ES el fee total: aplicá esos montos al/los engagement(s) por período (repartiéndolos si hay distribución). NO crees un engagement extra por eso.
- Usá el "Fee base" como fee total cuando los términos no indiquen otro monto.

Reglas:
- Para cada engagement: neurona (nombre del concepto/servicio), moneda (USD o ARS), regla de facturación (same | mep | mep_ipc), y períodos {fromMonth (1 = primer mes), toMonth (null = en adelante), fee, currency}.
- MONEDA vs REGLA (importante): "mep" y "mep_ipc" convierten un monto en USD a ARS (por tasa de cambio y/o IPC), así que si usás esas reglas la moneda DEBE ser USD (tanto del engagement como de sus períodos). Usá ARS únicamente con la regla "same" (se factura en pesos, sin conversión). Si el fee se factura "a tasa MEP" y/o "se actualiza por IPC", la moneda es USD con regla mep o mep_ipc.
- Para algo que los términos describan EXPLÍCITAMENTE como adicional/extra/aparte y se cobre ENCIMA del fee (ej: "setup inicial de 500 aparte", "implementación de CRM extra los primeros 3 meses"), creá un ENGAGEMENT APARTE con su neurona (ej: "Setup", "Implementación CRM") y sus períodos (ej: fromMonth 1, toMonth 3). NO uses additionalCharges (no se procesa). Si los términos solo describen el fee y su reparto, NO agregues nada adicional.
- "shares" = pago a cada consultor (honorarios): type "percent" (% del fee, 0-100) o "fixed" (monto en una moneda). Cada consultor aparece UNA sola vez en shares, asociado a un único engagement; no repitas el mismo consultor en varios engagements (salvo que los términos den montos distintos por servicio). Referenciá al consultor por nombre tal cual aparezca.
- Si los términos dicen "el consultor" de forma genérica y el proyecto tiene un único consultor, asignáselo a ese consultor (usá su nombre).
- additionalCharges: {concept, amount, currency, month (null = único/este mes), recurring}.
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
