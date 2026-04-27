import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logLlmUsage } from "@/lib/ai/log-usage";
import {
  INDUSTRY_CATEGORIES,
  coerceIndustryCategory,
  type IndustryCategory,
} from "@/lib/industry-categories";

const anthropic = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";

const NormalizedSchema = z.object({
  industry: z.string().nullable(),
  industryCategory: z.string().nullable(),
  employeeCount: z.string().nullable(),
  location: z.string().nullable(),
});

const VALID_BUCKETS = new Set([
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001+",
]);

export interface RawAccountFields {
  industry: string | null;
  employeeCount: string | null;
  location: string | null;
}

export interface NormalizedAccountFields {
  industry: string | null;
  industryCategory: IndustryCategory;
  employeeCount: string | null;
  location: string | null;
}

/**
 * Take whatever the user typed in the free-text fields and rewrite them
 * canonically. Always returns a valid `industryCategory` from the closed
 * list (falling back to "Otros") so the dashboard chart never sees nulls.
 *
 * Returns the input unchanged + "Otros" if every field is null/blank, or if
 * the LLM call fails. Never blocks the form save.
 */
export async function normalizeAccountFields(
  raw: RawAccountFields,
  ctx?: { workspaceId: string | null; accountId: string | null }
): Promise<NormalizedAccountFields> {
  const cleanIndustry = raw.industry?.trim() || null;
  const cleanEmployees = raw.employeeCount?.trim() || null;
  const cleanLocation = raw.location?.trim() || null;

  if (!cleanIndustry && !cleanEmployees && !cleanLocation) {
    return {
      industry: null,
      industryCategory: "Otros",
      employeeCount: null,
      location: null,
    };
  }

  const categoriesList = INDUSTRY_CATEGORIES.join('", "');

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Normalizá estos datos de una empresa cliente para que sean consistentes en charts/filtros del dashboard. NO inventes; si un campo está vacío o no podés inferirlo, dejalo en null (excepto industryCategory, que siempre debe ser uno de la lista cerrada).

ENTRADA:
- industria: ${cleanIndustry ?? "(vacío)"}
- empleados: ${cleanEmployees ?? "(vacío)"}
- ubicación: ${cleanLocation ?? "(vacío)"}

REGLAS:
- industry → frase corta en español, capitalización título (ej. "Ecommerce de ropa", "SaaS B2B de RRHH", "Consultoría legal"). Mantené el detalle específico — esto es el label visible al usuario.
- industryCategory → DEBE ser EXACTAMENTE uno de: "${categoriesList}". Mapeá la industria detallada a su bucket más amplio. Ejemplos: "Ecommerce de ropa" → "Ecommerce"; "SaaS B2B de RRHH" → "SaaS"; "Consultoría legal" → "Servicios profesionales"; "Agencia de growth" → "Agencia/Marketing"; "Plataforma de cursos online" → "Educación"; "Clínica dental" → "Salud"; "Wallet cripto" → "Fintech"; "Fábrica de muebles" → "Manufactura"; "Tienda física de zapatos" → "Retail"; "Productora de podcasts" → "Media y entretenimiento"; "Inmobiliaria" → "Real Estate". Si dudás, "Otros".
- employeeCount → DEBE ser uno de exactamente: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001+". Si el input dice "30 empleados" → "11-50". Si dice "150 personas" → "51-200". Si no se puede inferir, null.
- location → "Ciudad, País". Ej: "buenos aires" → "Buenos Aires, Argentina". "ny" → "New York, Estados Unidos". Si solo aparece país, devolvé el país capitalizado.

Respondé ÚNICAMENTE con JSON válido:
{"industry": "...", "industryCategory": "...", "employeeCount": "...", "location": "..."}`,
        },
      ],
    });

    if (ctx) {
      await logLlmUsage({
        workspaceId: ctx.workspaceId,
        accountId: ctx.accountId,
        taskName: "normalize-account-fields",
        model: MODEL,
        usage: response.usage,
      });
    }

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    const parsed = NormalizedSchema.parse(JSON.parse(match[0]));

    const finalEmployees =
      parsed.employeeCount && VALID_BUCKETS.has(parsed.employeeCount)
        ? parsed.employeeCount
        : cleanEmployees;
    return {
      industry: parsed.industry ?? cleanIndustry,
      industryCategory: coerceIndustryCategory(parsed.industryCategory),
      employeeCount: finalEmployees,
      location: parsed.location ?? cleanLocation,
    };
  } catch (err) {
    console.error("[normalizeAccountFields] failed", err);
    return {
      industry: cleanIndustry,
      industryCategory: "Otros",
      employeeCount: cleanEmployees,
      location: cleanLocation,
    };
  }
}
