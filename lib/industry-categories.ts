// Closed list of broad industry buckets used by the dashboard chart and the
// `byIndustry` breakdown drawer. The free-text `accounts.industry` column
// stays as the human-friendly detail label; this list is what we group by.
//
// Adding a new category is a small change:
// 1) append it here
// 2) update the prompt in `lib/ai/normalize-account-fields.ts` and
//    `trigger/tasks/enrich-account.ts`
// 3) optionally backfill existing rows by re-enriching
//
// "Otros" is the safety net — anything the LLM can't confidently bucket
// lands here, never null.

export const INDUSTRY_CATEGORIES = [
  "Ecommerce",
  "SaaS",
  "Servicios profesionales",
  "Agencia/Marketing",
  "Educación",
  "Salud",
  "Fintech",
  "Manufactura",
  "Retail",
  "Media y entretenimiento",
  "Real Estate",
  "Otros",
] as const;

export type IndustryCategory = (typeof INDUSTRY_CATEGORIES)[number];

export function isIndustryCategory(value: string): value is IndustryCategory {
  return (INDUSTRY_CATEGORIES as readonly string[]).includes(value);
}

/** Coerce a possibly-invalid LLM output to the closed list. */
export function coerceIndustryCategory(
  value: string | null | undefined
): IndustryCategory {
  if (!value) return "Otros";
  const trimmed = value.trim();
  return isIndustryCategory(trimmed) ? trimmed : "Otros";
}
