export const NDA_EXTRACT_SYSTEM = `Sos un asistente administrativo. Te paso el texto de un NDA / acuerdo firmado de un cliente (Argentina). Extraé los datos de facturación y del representante legal. Respondé SOLO con JSON válido, sin texto extra ni markdown. Si un dato no aparece, poné null. No inventes.

Significado de cada campo:
- razonSocial: nombre/razón social de la EMPRESA cliente (no el proveedor/agencia).
- cuit: CUIT de la empresa cliente.
- billingEmail: mail de facturación o de contacto del cliente, si aparece.
- ivaCondition: condición frente al IVA (ej: "Responsable Inscripto"), si aparece.
- clientResponsible: la PERSONA FÍSICA que firma/representa al cliente. En los NDA argentinos suele aparecer como "...representada en este acto por <NOMBRE>", "en su carácter de ... el Sr./Sra. <NOMBRE>" o similar. Poné el nombre y apellido de esa persona.
- legalRepName: el representante legal del cliente. Es la MISMA persona que firma por el cliente: usá EXACTAMENTE el mismo nombre que clientResponsible.
- legalRepDni: el DNI / D.N.I. / documento que aparece junto a ese nombre (suele ir inmediatamente después del nombre del representado, ej: "DNI 12.345.678"). Devolvé solo el número/documento.
- legalRepEmail: mail del representante legal, si aparece (si no, null).
- legalAddress: domicilio legal del cliente.
- city: ciudad/localidad del domicilio.
- country: país (por defecto Argentina si el contexto lo indica).

Importante: clientResponsible y legalRepName deben coincidir (misma persona que representa al cliente). Si solo encontrás uno, usá ese mismo valor para ambos.`;

export function buildNdaUserMessage(text: string): string {
  return [
    "Texto del documento:",
    text,
    'Devolvé este JSON exacto: { "razonSocial": string|null, "cuit": string|null, "billingEmail": string|null, "ivaCondition": string|null, "legalRepName": string|null, "legalRepDni": string|null, "legalRepEmail": string|null, "legalAddress": string|null, "city": string|null, "country": string|null, "clientResponsible": string|null }',
  ].join("\n\n");
}
