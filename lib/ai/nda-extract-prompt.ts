export const NDA_EXTRACT_SYSTEM = `Sos un asistente administrativo. Te paso el texto de un NDA / acuerdo firmado de un cliente (Argentina). Extraé los datos de facturación y del representante legal. Respondé SOLO con JSON válido, sin texto extra ni markdown. Si un dato no aparece, poné null. No inventes.`;

export function buildNdaUserMessage(text: string): string {
  return [
    "Texto del documento:",
    text,
    'Devolvé este JSON exacto: { "razonSocial": string|null, "cuit": string|null, "billingEmail": string|null, "ivaCondition": string|null, "legalRepName": string|null, "legalRepDni": string|null, "legalRepEmail": string|null, "legalAddress": string|null, "city": string|null, "country": string|null, "clientResponsible": string|null }',
  ].join("\n\n");
}
