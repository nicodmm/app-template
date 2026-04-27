# Industry Category Taxonomy + LinkedIn-Aware Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text industry chart in the dashboard with a closed taxonomy auto-classified by the LLM (no new form field) AND fix the enrichment task so it actually uses `linkedinUrl` to determine `employeeCount` via Anthropic's built-in `web_search` tool.

**Architecture:**
- New `industry_category` column derived deterministically by the LLM from a closed list of ~12 buckets. Free-text `industry` stays as the user-visible detail label; `industry_category` is the chart/filter axis. Normalization (manual edit) and enrichment (web/LinkedIn) both produce it; the form never asks for it.
- Enrichment task switches from a plain `fetch(websiteUrl)` to a Claude call with `web_search` tool access, receiving both the website's scraped text AND the `linkedinUrl`. Claude can google the LinkedIn page when scraping it directly is blocked, and pulls the employee bucket from the snippet.
- Dashboard "Industrias" chart swaps Recharts horizontal bars for a custom list-with-progress-bar layout that handles arbitrary label lengths and many buckets gracefully.

**Tech Stack:** Drizzle ORM (Postgres), Trigger.dev v4, Anthropic SDK with web_search tool, Next.js 15 server actions, Zod, Tailwind v4.

---

## File Structure

**New files:**
- `lib/industry-categories.ts` — closed list of canonical category labels (client-safe)
- `drizzle/migrations/0025_<name>.sql` — adds `industry_category` text column
- `drizzle/migrations/0025_<name>/down.sql` — drops the column

**Modified files:**
- `lib/drizzle/schema/accounts.ts` — declare `industryCategory` column
- `lib/ai/normalize-account-fields.ts` — output `industryCategory` from closed list, validate, fallback to "Otros"
- `trigger/tasks/enrich-account.ts` — accept `linkedinUrl`, switch to Claude + `web_search` tool, return `industryCategory`
- `app/actions/accounts.ts` — propagate `linkedinUrl` through `triggerEnrichment`, persist `industryCategory` on edit + reenrich
- `lib/queries/dashboard.ts` — `industries` snapshot + `byIndustry` breakdown + accounts-list industry filter all read `industry_category`
- `components/dashboard-industries-chart.tsx` — replace Recharts BarChart with list-with-bars

**Untouched (intentionally):**
- `components/edit-account-form.tsx` — `industry` field stays free-text, no new field
- `app/(protected)/app/accounts/new/page.tsx` — same

---

### Task 1: Closed industry taxonomy constants

**Files:**
- Create: `lib/industry-categories.ts`

- [ ] **Step 1: Create the constants file**

```ts
// lib/industry-categories.ts
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
export function coerceIndustryCategory(value: string | null | undefined): IndustryCategory {
  if (!value) return "Otros";
  const trimmed = value.trim();
  return isIndustryCategory(trimmed) ? trimmed : "Otros";
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (file is self-contained, no imports yet to anywhere else).

- [ ] **Step 3: Commit**

```bash
git add lib/industry-categories.ts
git commit -m "feat(industries): add closed taxonomy constants"
```

---

### Task 2: Schema column + migration

**Files:**
- Modify: `lib/drizzle/schema/accounts.ts`
- Create: `drizzle/migrations/0025_<auto>.sql` (generated)
- Create: `drizzle/migrations/0025_<auto>/down.sql`

- [ ] **Step 1: Add the column to the Drizzle schema**

Open `lib/drizzle/schema/accounts.ts` and add `industryCategory` immediately after `industry` (line 28):

```ts
    industry: text("industry"),
    industryCategory: text("industry_category"),
    employeeCount: text("employee_count"),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `drizzle/migrations/0025_<some-name>.sql` containing `ALTER TABLE "accounts" ADD COLUMN "industry_category" text;`

Note the generated folder name (e.g. `0025_curious_swarm`). Use it as `<NAME>` in the next step.

- [ ] **Step 3: Write the down migration**

Look at the auto-generated SQL filename, then create the matching `down.sql`:

```bash
# Replace <NAME> with the actual generated folder
mkdir -p drizzle/migrations/<NAME>
```

Create `drizzle/migrations/<NAME>/down.sql` with:

```sql
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "industry_category";
```

- [ ] **Step 4: Run the migration**

Run: `npm run db:migrate`
Expected: success message; the new column appears on `accounts`. (Existing rows have NULL — that's OK, backfill happens in Task 8.)

- [ ] **Step 5: Verify rollback works (sanity check, then re-apply)**

Run: `npm run db:rollback` → expected: column dropped.
Run: `npm run db:migrate` → expected: column re-added.

- [ ] **Step 6: Commit**

```bash
git add lib/drizzle/schema/accounts.ts drizzle/migrations/0025_*
git commit -m "feat(accounts): add industry_category column"
```

---

### Task 3: Normalize free-text edits to a category

**Files:**
- Modify: `lib/ai/normalize-account-fields.ts`

- [ ] **Step 1: Update the schema and prompt**

Replace the entire content of `lib/ai/normalize-account-fields.ts` with:

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS. (Note: callers in `app/actions/accounts.ts` will be updated in Task 5 — but the Task 3 change here only adds a new field on the return type, callers reading `industry`/`employeeCount`/`location` keep working without changes. Type-check should pass.)

- [ ] **Step 3: Commit**

```bash
git add lib/ai/normalize-account-fields.ts
git commit -m "feat(normalize): emit industryCategory from closed taxonomy"
```

---

### Task 4: Enrichment task uses LinkedIn + web_search

**Files:**
- Modify: `trigger/tasks/enrich-account.ts`

- [ ] **Step 1: Replace the task implementation**

Replace the entire content of `trigger/tasks/enrich-account.ts` with:

```ts
import { task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { logLlmUsage } from "@/lib/ai/log-usage";
import {
  INDUSTRY_CATEGORIES,
  coerceIndustryCategory,
} from "@/lib/industry-categories";

const MODEL = "claude-haiku-4-5-20251001";
const client = new Anthropic();

const EnrichmentSchema = z.object({
  industry: z.string().nullable(),
  industryCategory: z.string().nullable(),
  employeeCount: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
});

interface EnrichAccountInput {
  accountId: string;
  workspaceId: string;
  websiteUrl: string;
  linkedinUrl?: string | null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const enrichAccount = task({
  id: "enrich-account",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 10000, factor: 2 },
  run: async (payload: EnrichAccountInput): Promise<void> => {
    const normalized = normalizeUrl(payload.websiteUrl);
    if (!normalized) {
      await db
        .update(accounts)
        .set({
          enrichmentStatus: "failed",
          enrichmentError: "URL inválida",
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, payload.accountId));
      return;
    }

    const linkedinUrl = payload.linkedinUrl?.trim() || null;

    await db
      .update(accounts)
      .set({
        enrichmentStatus: "pending",
        enrichmentError: null,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, payload.accountId));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(normalized, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; nao.fyi/1.0; +https://nao.fyi)",
          Accept: "text/html,application/xhtml+xml",
        },
      }).catch((err) => {
        throw new Error(`No se pudo acceder al sitio: ${err.message ?? "timeout"}`);
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`El sitio respondió ${res.status}`);
      }

      const rawHtml = await res.text();
      const cleanText = htmlToText(rawHtml).substring(0, 15000);

      if (cleanText.length < 50) {
        throw new Error("El sitio no devolvió contenido legible");
      }

      const categoriesList = INDUSTRY_CATEGORIES.join('", "');

      // Single Claude call with web_search tool. The model uses the website
      // text as primary source and falls back to web_search ONLY when
      // employeeCount is not derivable from the website itself — typical for
      // company sites that don't advertise headcount. LinkedIn employee
      // ranges are public via Google snippets even when the page itself is
      // gated, so the search hits the snippet.
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
          } as never,
        ],
        messages: [
          {
            role: "user",
            content: `Analizá el siguiente contenido del sitio web de una empresa y extraé datos clave para una agencia de marketing.

SITIO: ${normalized}
LINKEDIN: ${linkedinUrl ?? "(no provisto)"}

CONTENIDO DEL SITIO:
${cleanText}

INSTRUCCIONES:
1. Inferí lo que puedas DEL SITIO. Si "employeeCount" no aparece en el sitio Y hay un linkedinUrl, usá la herramienta web_search con la query "${linkedinUrl ?? ""}" o "[nombre empresa] linkedin employees" para encontrar el rango de empleados — los snippets de LinkedIn lo muestran (ej: "11-50 employees").
2. NO inventes. Si no podés inferir un dato con confianza incluso después de buscar, devolvé null.
3. Limitate a 2 búsquedas como máximo. Si no encontrás el dato, devolvé null.

Devolvé SOLO JSON válido al final, sin texto extra antes ni después:

{
  "industry": "frase corta en español describiendo la industria detallada (ej: 'Ecommerce de ropa', 'SaaS B2B de RRHH'). null si no está claro.",
  "industryCategory": "EXACTAMENTE uno de: \\"${categoriesList}\\". Mapeá la industria detallada a su bucket amplio. Si dudás, 'Otros'.",
  "employeeCount": "uno de: '1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'. null si no podés estimar.",
  "location": "ciudad, país (ej: 'Buenos Aires, Argentina'). null si no figura.",
  "description": "una o dos oraciones describiendo qué hace la empresa y a quién apunta. null si no tenés información.",
  "confidence": "'low' | 'medium' | 'high' — tu confianza global."
}`,
          },
        ],
      });

      await logLlmUsage({
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        taskName: "enrich-account",
        model: MODEL,
        usage: response.usage,
      });

      // The response may include tool_use + tool_result blocks before the
      // final text block. Take the LAST text block, which is the answer.
      const textBlocks = response.content.filter(
        (b): b is { type: "text"; text: string } => b.type === "text"
      );
      const finalText = textBlocks[textBlocks.length - 1]?.text ?? "";
      const jsonMatch = finalText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("El modelo no devolvió JSON");
      const parsed = EnrichmentSchema.parse(JSON.parse(jsonMatch[0]));

      await db
        .update(accounts)
        .set({
          industry: parsed.industry,
          industryCategory: coerceIndustryCategory(parsed.industryCategory),
          employeeCount: parsed.employeeCount,
          location: parsed.location,
          companyDescription: parsed.description,
          enrichedAt: new Date(),
          enrichmentStatus: "ok",
          enrichmentError: null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, payload.accountId));

      logger.info("Account enriched", {
        accountId: payload.accountId,
        confidence: parsed.confidence,
        usedLinkedin: !!linkedinUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      logger.error("Enrichment failed", { accountId: payload.accountId, message });
      await db
        .update(accounts)
        .set({
          enrichmentStatus: "failed",
          enrichmentError: message.substring(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, payload.accountId));
    }
  },
});
```

> **Note on the `as never` cast on the web_search tool:** the SDK type for `tools` only knows about user-defined function tools. Anthropic's server-side built-in tools (`web_search_20250305`) are accepted by the API but not yet typed in the SDK at the version pinned in this repo. The cast is intentional and the runtime accepts the object as-is. If a newer SDK adds typing, drop the cast.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add trigger/tasks/enrich-account.ts
git commit -m "feat(enrich): use linkedinUrl + web_search for employee count"
```

- [ ] **Step 4: Manual smoke test (defer until after Task 5)**

The task can't be triggered usefully until `app/actions/accounts.ts` passes `linkedinUrl` (Task 5). Smoke test happens at the end of Task 5.

---

### Task 5: Server actions propagate linkedinUrl + persist industryCategory

**Files:**
- Modify: `app/actions/accounts.ts`

- [ ] **Step 1: Update `triggerEnrichment` signature to accept linkedinUrl**

In `app/actions/accounts.ts`, replace the `triggerEnrichment` helper (lines 63-79) with:

```ts
async function triggerEnrichment(
  accountId: string,
  workspaceId: string,
  websiteUrl: string,
  linkedinUrl: string | null
): Promise<void> {
  try {
    const { tasks } = await import("@trigger.dev/sdk/v3");
    await tasks.trigger("enrich-account", {
      accountId,
      workspaceId,
      websiteUrl,
      linkedinUrl,
    });
  } catch (err) {
    // Best-effort: never block the create/update flow on Trigger.dev issues.
    console.error("Failed to enqueue enrich-account", err);
  }
}
```

- [ ] **Step 2: Update `createAccount` to pass linkedinUrl**

Locate the `if (websiteUrl)` block inside `createAccount` (around line 123) and change:

```ts
  if (websiteUrl) {
    await triggerEnrichment(account.id, workspace.id, websiteUrl);
  }
```

To:

```ts
  if (websiteUrl) {
    await triggerEnrichment(account.id, workspace.id, websiteUrl, linkedinUrl);
  }
```

- [ ] **Step 3: Update `updateAccount` to persist industryCategory + pass linkedinUrl**

Inside `updateAccount`, after the `normalizeAccountFields` call (around line 193), the variables `industry`, `employeeCount`, `location` are reassigned. Add `industryCategory` to that flow.

Find the block:

```ts
  let industry = rawIndustry;
  let employeeCount = rawEmployeeCount;
  let location = rawLocation;
  if (fieldsChanged) {
    const normalized = await normalizeAccountFields(
      {
        industry: rawIndustry,
        employeeCount: rawEmployeeCount,
        location: rawLocation,
      },
      { workspaceId: workspace.id, accountId }
    );
    industry = normalized.industry;
    employeeCount = normalized.employeeCount;
    location = normalized.location;
  }
```

Replace with:

```ts
  let industry = rawIndustry;
  let employeeCount = rawEmployeeCount;
  let location = rawLocation;
  let industryCategory: string | undefined; // undefined = don't update column
  if (fieldsChanged) {
    const normalized = await normalizeAccountFields(
      {
        industry: rawIndustry,
        employeeCount: rawEmployeeCount,
        location: rawLocation,
      },
      { workspaceId: workspace.id, accountId }
    );
    industry = normalized.industry;
    employeeCount = normalized.employeeCount;
    location = normalized.location;
    industryCategory = normalized.industryCategory;
  }
```

Then in the `db.update(accounts).set(...)` block right below, find the line `industry,` and add the conditional spread for `industryCategory`. Replace the existing set block:

```ts
    .set({
      name: name.trim(),
      goals,
      serviceScope,
      ownerId,
      startDate,
      fee,
      enabledModules,
      websiteUrl,
      linkedinUrl,
      industry,
      employeeCount,
      location,
      companyDescription,
      ...(websiteChanged && websiteUrl
        ? { enrichmentStatus: "pending", enrichmentError: null }
        : {}),
      updatedAt: new Date(),
    })
```

With:

```ts
    .set({
      name: name.trim(),
      goals,
      serviceScope,
      ownerId,
      startDate,
      fee,
      enabledModules,
      websiteUrl,
      linkedinUrl,
      industry,
      employeeCount,
      location,
      companyDescription,
      ...(industryCategory !== undefined ? { industryCategory } : {}),
      ...(websiteChanged && websiteUrl
        ? { enrichmentStatus: "pending", enrichmentError: null }
        : {}),
      updatedAt: new Date(),
    })
```

And also update the `triggerEnrichment` call near the bottom of `updateAccount`:

```ts
  if (websiteChanged && websiteUrl) {
    await triggerEnrichment(accountId, workspace.id, websiteUrl);
  }
```

Becomes:

```ts
  if (websiteChanged && websiteUrl) {
    await triggerEnrichment(accountId, workspace.id, websiteUrl, linkedinUrl);
  }
```

- [ ] **Step 4: Update `reEnrichAccount` to pass linkedinUrl**

Find:

```ts
  await triggerEnrichment(accountId, workspace.id, account.websiteUrl);
```

Replace with:

```ts
  await triggerEnrichment(accountId, workspace.id, account.websiteUrl, account.linkedinUrl);
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 6: Build sanity check**

Run: `npm run build`
Expected: PASS (catches any wider type fallout).

- [ ] **Step 7: Commit**

```bash
git add app/actions/accounts.ts
git commit -m "feat(accounts): propagate linkedinUrl + persist industry_category"
```

- [ ] **Step 8: Deploy Trigger.dev tasks**

Critical — Trigger.dev workers DO NOT auto-redeploy from `git push` for code changes inside `trigger/`. The `.github/workflows/trigger-deploy.yml` action handles master pushes, but during local development we deploy manually:

Run: `npx trigger.dev@latest deploy`
Expected: deployment succeeds and the new `enrich-account` task version is live.

(If you skip this, the next account creation will run the OLD task that ignores `linkedinUrl` and you'll think the fix didn't work.)

- [ ] **Step 9: Smoke test the enrichment**

In the dev app:
1. Create a new account with `websiteUrl = https://stripe.com` and `linkedinUrl = https://www.linkedin.com/company/stripe`
2. Wait ~30s and refresh the account page
3. Verify: `industry` is meaningful (e.g. "Fintech" or similar), `industryCategory` = "Fintech", `employeeCount` is set (Stripe shows on LinkedIn as 5001-10000, should bucket to "1001+")
4. If `employeeCount` is null, check Trigger.dev logs for the run — confirm the model invoked `web_search` at least once

---

### Task 6: Dashboard query reads industry_category

**Files:**
- Modify: `lib/queries/dashboard.ts`

- [ ] **Step 1: Update the in-scope account select**

Open `lib/queries/dashboard.ts`. In `getWorkspaceDashboardSnapshot`, the `inScopeAccounts` query (around line 96) selects `industry: accounts.industry`. Add `industryCategory`:

```ts
  const inScopeAccounts = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      fee: accounts.fee,
      startDate: accounts.startDate,
      closedAt: accounts.closedAt,
      healthSignal: accounts.healthSignal,
      industry: accounts.industry,
      industryCategory: accounts.industryCategory,
      employeeCount: accounts.employeeCount,
    })
    .from(accounts)
    .where(and(...baseConds));
```

- [ ] **Step 2: Aggregate by category instead of free-text**

In the same function, find the in-memory aggregation block (around line 257-264):

```ts
  const industryCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  for (const a of inScopeAccounts) {
    const ind = (a.industry ?? "").trim() || "Sin clasificar";
    industryCounts.set(ind, (industryCounts.get(ind) ?? 0) + 1);
    const sz = (a.employeeCount ?? "").trim() || "Sin clasificar";
    sizeCounts.set(sz, (sizeCounts.get(sz) ?? 0) + 1);
  }
```

Replace the industry aggregation to use the category:

```ts
  const industryCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  for (const a of inScopeAccounts) {
    const ind = (a.industryCategory ?? "").trim() || "Sin clasificar";
    industryCounts.set(ind, (industryCounts.get(ind) ?? 0) + 1);
    const sz = (a.employeeCount ?? "").trim() || "Sin clasificar";
    sizeCounts.set(sz, (sizeCounts.get(sz) ?? 0) + 1);
  }
```

(The `industries` field on `DashboardSnapshot` keeps shape `{ industry: string; count: number }` — the `industry` value is now the category label. We're not renaming the field to avoid touching every consumer.)

- [ ] **Step 3: Update the breakdown query**

In `getDashboardMetricBreakdown`, find the `accountsTyped` mapping (around line 406-415) and add `industryCategory`:

```ts
  const accountsTyped: BreakdownAccount[] = rows.map((r) => ({
    id: r.id,
    fee: r.fee !== null ? Number(r.fee) : null,
    startDate: r.startDate,
    closedAt: r.closedAt,
    serviceScope: r.serviceScope,
    industry: r.industry,
    industryCategory: r.industryCategory,
    employeeCount: r.employeeCount,
    ownerName: r.ownerId ? (ownerNames.get(r.ownerId) ?? "Sin nombre") : null,
  }));
```

Update the corresponding `BreakdownAccount` interface (around line 311-320):

```ts
interface BreakdownAccount {
  id: string;
  fee: number | null;
  startDate: string | null;
  closedAt: Date | null;
  serviceScope: string | null;
  industry: string | null;
  industryCategory: string | null;
  employeeCount: string | null;
  ownerName: string | null;
}
```

Update the select inside `getDashboardMetricBreakdown` (around line 377-388):

```ts
  const rows = await db
    .select({
      id: accounts.id,
      fee: accounts.fee,
      startDate: accounts.startDate,
      closedAt: accounts.closedAt,
      serviceScope: accounts.serviceScope,
      industry: accounts.industry,
      industryCategory: accounts.industryCategory,
      employeeCount: accounts.employeeCount,
      ownerId: accounts.ownerId,
    })
    .from(accounts)
    .where(and(...baseConds));
```

Update the `groupBy` helper to use `industryCategory` for the industry axis. Find:

```ts
  const groupBy = (key: "industry" | "employeeCount") => {
    const m = new Map<string, BreakdownAccount[]>();
    for (const a of accountsTyped) {
      const label = (a[key] ?? "").trim() || "Sin clasificar";
      if (!m.has(label)) m.set(label, []);
      m.get(label)!.push(a);
    }
    return [...m.entries()]
      .map(([label, group]) => ({
        label,
        value: aggregateMetric(group, metric),
        accountsCount: group.length,
      }))
      .sort((a, b) => b.value - a.value);
  };
  const byIndustry = groupBy("industry");
  const bySize = groupBy("employeeCount");
```

Replace with:

```ts
  const groupBy = (key: "industryCategory" | "employeeCount") => {
    const m = new Map<string, BreakdownAccount[]>();
    for (const a of accountsTyped) {
      const label = (a[key] ?? "").trim() || "Sin clasificar";
      if (!m.has(label)) m.set(label, []);
      m.get(label)!.push(a);
    }
    return [...m.entries()]
      .map(([label, group]) => ({
        label,
        value: aggregateMetric(group, metric),
        accountsCount: group.length,
      }))
      .sort((a, b) => b.value - a.value);
  };
  const byIndustry = groupBy("industryCategory");
  const bySize = groupBy("employeeCount");
```

- [ ] **Step 4: Update the accounts-list industry filter**

Find the filter handler in `getDashboardAccountsList` (around line 505-512):

```ts
  } else if (filter.type === "industry") {
    if (filter.value === "Sin clasificar") {
      conds.push(
        sql`(${accounts.industry} IS NULL OR btrim(${accounts.industry}) = '')`
      );
    } else {
      conds.push(eq(accounts.industry, filter.value));
    }
  }
```

Replace with:

```ts
  } else if (filter.type === "industry") {
    if (filter.value === "Sin clasificar") {
      conds.push(
        sql`(${accounts.industryCategory} IS NULL OR btrim(${accounts.industryCategory}) = '')`
      );
    } else {
      conds.push(eq(accounts.industryCategory, filter.value));
    }
  }
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 6: Verify the dashboard renders**

Start dev: `npm run dev`. Navigate to `/app/dashboard`. The "Industrias" chart will still look bad (Task 7 fixes that), but it should NOT throw, and the labels should now be the broad categories — though for existing accounts with NULL `industry_category` they'll all be "Sin clasificar" until backfill (Task 8).

- [ ] **Step 7: Commit**

```bash
git add lib/queries/dashboard.ts
git commit -m "feat(dashboard): aggregate by industry_category"
```

---

### Task 7: Replace industries chart with list-with-bars

**Files:**
- Modify: `components/dashboard-industries-chart.tsx`

- [ ] **Step 1: Replace the component implementation**

Replace the entire content of `components/dashboard-industries-chart.tsx` with:

```tsx
"use client";

interface DashboardIndustriesChartProps {
  industries: Array<{ industry: string; count: number }>;
  onSegmentClick?: (industry: string) => void;
}

export function DashboardIndustriesChart({
  industries,
  onSegmentClick,
}: DashboardIndustriesChartProps) {
  // Take all rows; the closed taxonomy keeps the list bounded (~12 max).
  const data = industries;
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <div className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h3 className="text-sm font-semibold mb-3">Industrias</h3>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos.</p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((row) => {
            const pct = max > 0 ? (row.count / max) * 100 : 0;
            const clickable = !!onSegmentClick;
            const RowTag = clickable ? "button" : "div";
            return (
              <li key={row.industry}>
                <RowTag
                  type={clickable ? "button" : undefined}
                  onClick={
                    clickable
                      ? () => onSegmentClick!(row.industry)
                      : undefined
                  }
                  className={`group flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors ${
                    clickable ? "cursor-pointer hover:bg-accent/40" : ""
                  }`}
                  title={row.industry}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-medium">
                      {row.industry}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {row.count}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </RowTag>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Visual smoke test**

`npm run dev` → navigate to `/app/dashboard`. Verify:
- Each industry row shows the full label (or truncated with `…` only if extremely long, with the full name in the `title` tooltip)
- The bar reflects the count proportionally to the largest bucket
- Clicking a row opens the accounts drawer filtered to that industry (drawer integration was already wired via `onSegmentClick`)
- No overlap, no overflow, looks clean

- [ ] **Step 4: Commit**

```bash
git add components/dashboard-industries-chart.tsx
git commit -m "refactor(dashboard): list-with-bars chart for industries"
```

---

### Task 8: Backfill the existing accounts

**Files:**
- None (manual ops)

- [ ] **Step 1: List the accounts that need backfill**

Run a quick check via the Drizzle Studio or a one-off SQL query:

```bash
npm run db:status
```

Or, in the Supabase dashboard SQL editor:

```sql
SELECT id, name, website_url, linkedin_url, industry, industry_category
FROM accounts
WHERE closed_at IS NULL
ORDER BY created_at DESC;
```

Confirm the count is small (4-ish per the project memory).

- [ ] **Step 2: Re-enrich each account**

For each account with a `website_url`:
1. Open `/app/accounts/<id>` in the dev app
2. Click the "Re-enriquecer" button (existing UI, hits `reEnrichAccount`)
3. Wait ~30s and refresh

After all are done, re-run the SQL above and verify every row has a non-null `industry_category` from the closed list.

For accounts without a `website_url`, edit them manually — the cheap path: bump any field, save (the `normalizeAccountFields` call will set `industry_category`). Or if `industry` is empty, set it to a hint string like "Otros" and save.

- [ ] **Step 3: Verify the dashboard now shows real categories**

Open `/app/dashboard`. The "Industrias" chart should now show the broad buckets distributed correctly, no "Sin clasificar" unless an account legitimately has none.

- [ ] **Step 4: No commit**

This is a data-only step. Nothing to commit.

---

### Task 9: End-to-end verification

**Files:** None

- [ ] **Step 1: Run the full type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (no new warnings introduced).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Smoke test the create-account flow with LinkedIn-only employee count**

Pick a company whose website does NOT show employee count but whose LinkedIn does. Suggested: a small startup with a one-page marketing site.

1. `/app/accounts/new` → fill `name`, `websiteUrl`, `linkedinUrl`, save
2. Wait 30s
3. Account detail page should show: `industry` (detail), `industryCategory` (broad — visible on the dashboard chart), `employeeCount` (the bucket), `location`, `companyDescription`
4. Trigger.dev dashboard run logs should show at least one `web_search` invocation

- [ ] **Step 5: Smoke test the dashboard drill-down**

1. `/app/dashboard` → click any bar in the Industrias chart
2. The accounts-list drawer opens, filtered to that broad category
3. The accounts shown all share that category (verify via account detail)

- [ ] **Step 6: Final commit if any tweaks were made**

```bash
git status
# If any unstaged tweaks from manual testing, commit them. Otherwise skip.
```

- [ ] **Step 7: Push to master (per project's auto-push policy)**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Closed industry taxonomy (Task 1)
- ✅ Auto-classified by LLM, no new form field (Tasks 3, 4 — both `normalizeAccountFields` and `enrichAccount` set it)
- ✅ Dashboard chart fix that handles long labels (Task 7)
- ✅ Future-proof grouping (Task 6 reads `industry_category`)
- ✅ Employee count fixed via LinkedIn (Task 4 uses `web_search`)
- ✅ Backfill of existing accounts (Task 8)
- ✅ Migration with down.sql (Task 2)
- ✅ Trigger.dev redeploy reminder (Task 5 step 8)

**Placeholder scan:** No TODOs, no "implement later", no "similar to". Every code step has full code.

**Type consistency:**
- `IndustryCategory` type from `lib/industry-categories.ts` used in both `normalize-account-fields.ts` and the coercion path in `enrich-account.ts` ✅
- `industryCategory` column name is consistent across schema, queries, and actions ✅
- `BreakdownAccount` interface gains `industryCategory: string | null` (Task 6 step 3) before `groupBy("industryCategory")` is called (Task 6 step 3) ✅
- `EnrichAccountInput` adds `linkedinUrl?: string | null` (Task 4) — consumed by `triggerEnrichment` updated in Task 5 ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-industry-category-and-linkedin-enrichment.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
