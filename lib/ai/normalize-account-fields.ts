import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logLlmUsage } from "@/lib/ai/log-usage";

const anthropic = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";

// employeeCount accepts any string at parse time so we don't blow up on
// off-bucket model output; we trust the prompt to keep it canonical and
// fall through to the user's raw value if it doesn't.
const NormalizedSchema = z.object({
  industry: z.string().nullable(),
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

export type NormalizedAccountFields = z.infer<typeof NormalizedSchema>;

/**
 * Take whatever the user typed in the free-text fields and rewrite them in
 * a canonical shape so charts and filters group them sensibly. Keeps the
 * call cheap with a tight max_tokens — no long-form output expected.
 *
 * Returns the input unchanged if every field is null/blank, or if the LLM
 * call fails (best-effort: never blocks the form save).
 */
export async function normalizeAccountFields(
  raw: RawAccountFields,
  ctx?: { workspaceId: string | null; accountId: string | null }
): Promise<NormalizedAccountFields> {
  const cleanIndustry = raw.industry?.trim() || null;
  const cleanEmployees = raw.employeeCount?.trim() || null;
  const cleanLocation = raw.location?.trim() || null;

  // Nothing to normalize
  if (!cleanIndustry && !cleanEmployees && !cleanLocation) {
    return {
      industry: null,
      employeeCount: null,
      location: null,
    };
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Normalizá estos datos de una empresa cliente para que sean consistentes en charts/filtros del dashboard. NO inventes; si un campo está vacío o no podés inferirlo, dejalo en null.

ENTRADA:
- industria: ${cleanIndustry ?? "(vacío)"}
- empleados: ${cleanEmployees ?? "(vacío)"}
- ubicación: ${cleanLocation ?? "(vacío)"}

REGLAS:
- industry → frase corta en español, capitalización título (ej. "Ecommerce", "SaaS B2B", "Consultoría", "Agencia de Growth", "Retail", "Edtech"). Sé consistente: si es "ecommerce de ropa", normalizá a "Ecommerce". Si no se puede normalizar, dejá el original con primera letra mayúscula.
- employeeCount → DEBE ser uno de exactamente: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001+". Si el input dice "30 empleados" → "11-50". Si dice "150 personas" → "51-200". Si no se puede inferir, null.
- location → "Ciudad, País". Ej: "buenos aires" → "Buenos Aires, Argentina". "ny" → "New York, Estados Unidos". Si solo aparece país, devolvé el país capitalizado. Si solo aparece ciudad y conocés el país, agregalo.

Respondé ÚNICAMENTE con JSON válido:
{"industry": "...", "employeeCount": "...", "location": "..."}`,
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

    // Defensive: if the LLM nulled a field that the user actually typed,
    // fall back to the user's raw value. Same with off-bucket employeeCount.
    const finalEmployees =
      parsed.employeeCount && VALID_BUCKETS.has(parsed.employeeCount)
        ? parsed.employeeCount
        : cleanEmployees;
    return {
      industry: parsed.industry ?? cleanIndustry,
      employeeCount: finalEmployees,
      location: parsed.location ?? cleanLocation,
    };
  } catch (err) {
    console.error("[normalizeAccountFields] failed", err);
    return {
      industry: cleanIndustry,
      employeeCount: cleanEmployees,
      location: cleanLocation,
    };
  }
}
