# Sub-project C — "Contexto de la cuenta" enriquecido (LLM scraping)

**Date:** 2026-04-24
**Status:** Design (auto-mode, approved — option C2)
**Parent scope:** plani.fyi UX refresh

---

## Goal

Turn the "Contexto de la cuenta" section from a passive display of `goals`+`serviceScope` into a useful client snapshot: industry, size, location, a short company description, and links to the client's web / LinkedIn. Enrichment is LLM-driven (Claude Haiku against the fetched website HTML) so we don't pay per-account to a dedicated API.

## Out of scope

- LinkedIn scraping (blocked without auth; we only store the URL).
- Multiple social channels. Website + LinkedIn is enough for v1.
- Automatic refresh on a schedule. Enrichment runs on create, on website URL change, and on manual button press. No cron.

## Schema (`lib/drizzle/schema/accounts.ts`)

New columns on `accounts`, all nullable:

```ts
websiteUrl: text("website_url"),
linkedinUrl: text("linkedin_url"),

industry: text("industry"),
employeeCount: text("employee_count"),       // string — "50-100" style ranges are common
location: text("location"),
companyDescription: text("company_description"),  // short 1-2 sentence summary

enrichedAt: timestamp("enriched_at"),
enrichmentStatus: text("enrichment_status"), // null | "pending" | "ok" | "failed"
enrichmentError: text("enrichment_error"),
```

## Trigger task: `trigger/tasks/enrich-account.ts`

Input: `{ accountId: string; workspaceId: string; websiteUrl: string }`

Steps:

1. Set `enrichment_status = "pending"` on the account.
2. Fetch the URL with a 10s timeout and a real User-Agent. Follow redirects. If non-2xx, set status `failed` with the status code as the error and return.
3. Strip scripts/styles and collapse HTML to plain text (cap at 15KB). A small regex-based helper is enough — no need for `cheerio`.
4. Send the cleaned text to `claude-haiku-4-5-20251001` with a structured-output prompt asking for:
   - `industry` — one short phrase
   - `employeeCount` — a size bucket string ("1-10", "11-50", "51-200", "201-500", "501-1000", "1001+") or null
   - `location` — city, country
   - `description` — one to two sentence company description in Spanish
   - `confidence` — low/medium/high
   Instruct Claude to emit `null` for any field it can't confidently infer — never invent.
5. Parse JSON, validate with zod (all fields nullable).
6. Update the account row: set the five content columns, `enrichedAt = now()`, `enrichmentStatus = "ok"`, `enrichmentError = null`.
7. Catch any thrown error; write `enrichmentStatus = "failed"` + the message. Don't throw — this is a background enrichment, not a hard-failure path.

Retry: `maxAttempts: 2`. Short so we don't hammer a broken site.

## Server action wiring

- `createAccount` — after the insert, if `website_url` was provided, `tasks.trigger<typeof enrichAccount>("enrich-account", {...})`. Fire-and-forget.
- `updateAccount` — if `website_url` changed (or went from null to set), re-trigger. Otherwise, no.
- New server action `reEnrichAccount(accountId)` — requires auth + workspace ownership; triggers the task manually. Used by a button in the Contexto section.

## UI

### Forms (create + edit)

Two new inputs stacked with the existing ones:

- "Página web" (`websiteUrl`, `type="url"`, placeholder `https://...`)
- "LinkedIn de la empresa" (`linkedinUrl`, `type="url"`)

### Contexto card on detail page

Change the current "Contexto de la cuenta" card so it becomes the authoritative company view:

- Header row: name (already shown above), industry badge if present.
- Grid (2 cols on sm+):
  - Objetivos (existing)
  - Scope de servicio (existing)
  - Fecha de inicio (already added in A)
  - Fee mensual (already added in A)
  - **Industria** (new)
  - **Empleados** (new)
  - **Ubicación** (new)
  - **Web / LinkedIn** (new — two small link chips)
- Footer: `companyDescription` rendered as muted prose below the grid when present.
- Status line: "Enriquecido hace X" or "Enriqueciendo..." or "Error al enriquecer" + a small `Re-enriquecer` button (server action `reEnrichAccount`). Button disabled when status is `pending`.

## Verification

- `npm run type-check` + `npm run build`.
- Manual: create an account with `https://anthropic.com` as website. Wait a few seconds. Refresh. Expect industry/location/description populated, status shows "enriquecido".
- Manual: edit an existing account, change the URL to a 404 page, verify status flips to `failed` with a sensible error.

## Risks

- Some sites block generic fetches (403/429). We report the status code and stop — user can retry. No SSRF mitigation beyond "only fetch http(s) URLs the user typed."
- HTML-to-text stripping is crude but sufficient: Claude tolerates messy input. If this gets noisy we can introduce `cheerio`.
- LLM hallucination is controlled by the `null`-when-unsure instruction + `confidence` field. We can later hide low-confidence rows if needed.
