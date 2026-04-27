# Public Client View — Design Spec

**Date:** 2026-04-27
**Status:** Approved (pending user review of this doc)

## Goal

Give every account a shareable, read-only public URL the agency can hand to its end-client so the client has live, transparent visibility into the work being done. The agency controls per-account which sections are visible, can optionally protect the link with a password, and can rename Meta campaigns/ads with client-friendly labels.

## Non-goals (explicit, for MVP)

- Snapshot/frozen-in-time views (it's always live)
- Comments, approvals, or any client-side actions
- Notifications when the client opens the link
- Multi-account client portal (one login → many agencies)
- Custom CSS/branding per account
- Transactional email (the agency sends the link manually)
- Ad-set name overrides (only campaigns + ads in MVP)
- A "preview as client" mode in the agency UI

## Use case (locked)

**Continuous transparency, always live.** The client opens the link whenever and sees the current state. Same link works on day 1 and day 90. Replaces the static-PDF/Notion-doc workflow most agencies use for client reporting.

## Architecture

### URL structure
- Public: `https://nao.fyi/c/{token}`
- The route lives outside `(protected)`: `app/(public)/c/[token]/page.tsx`
- Token is 32 characters, URL-safe random (crypto.randomBytes → base64url)
- Tokens are per-account-share-link; one account can theoretically have multiple but MVP creates exactly one per account

### Auth model
- **Token-only by default.** Anyone with the link sees the content.
- **Password optional per link.** When set:
  - First visit: password gate page; correct password sets a signed cookie (`share_{token}`, HttpOnly, SameSite=Lax, 30-day expiry).
  - Subsequent visits with valid cookie: skip the gate.
  - Changing or clearing the password rotates a `password_version` integer that's part of the cookie's signed payload, so old cookies are invalidated automatically.
  - Hash with bcrypt (cost 10).
  - Rate limit: 5 failed attempts on the same token within 60 seconds → 5-minute lockout for that token (in-memory Map keyed by token; expires on its own).

### Glassmorphism shell, no app chrome
- The `(public)` layout already exists for the marketing site; the share view uses its own minimal layout that mirrors the visual language but drops the sidebar / app header.
- Header: workspace logo (if present) + workspace name (small) + account name (h1) + "Tu equipo: {ownerName}" subtitle.
- Footer: "Última actualización: hace X" + "Hecho con [nao.fyi](https://nao.fyi)".
- `<meta name="robots" content="noindex,nofollow">` + `X-Robots-Tag` header so these links never get indexed.

## Data model

### `account_share_links`
```sql
CREATE TABLE account_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  password_hash text,                        -- null = no password
  password_version integer NOT NULL DEFAULT 0, -- bumped on password change/clear
  is_active boolean NOT NULL DEFAULT true,
  share_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  view_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX account_share_links_account_idx ON account_share_links(account_id);
CREATE INDEX account_share_links_token_idx ON account_share_links(token);
```

`share_config` shape (TypeScript):
```ts
interface ShareConfig {
  summary: boolean;        // default true
  context: boolean;        // default false (objetivos/fechas/links — fee NEVER shown)
  lastMeeting: boolean;    // default true
  files: boolean;          // default true
  tasks: boolean;          // default true
  participants: boolean;   // default true
  signals: boolean;        // default false (and only positive types when on)
  crm: boolean;            // default false
  health: boolean;         // default false
  paidMedia: boolean;      // default true
}
```

### Two new columns on existing tables
```sql
ALTER TABLE meta_campaigns ADD COLUMN public_name text;
ALTER TABLE meta_ads ADD COLUMN public_name text;

ALTER TABLE accounts ADD COLUMN client_summary text;
ALTER TABLE accounts ADD COLUMN client_summary_updated_at timestamp;
```

`public_name` overrides what the client sees in paid media tables. `name` is unchanged (still the Meta-source-of-truth in the agency view). The agency edits `public_name` inline.

`client_summary` is a separate, client-facing tone version of `aiSummary`. Generated alongside `aiSummary` in the same `generate-summary` task — same LLM call, expanded JSON output schema (no extra round-trip, ~10% more output tokens).

## Sections rendered in the public view

Each section honors `share_config` toggles. If a section is enabled but the account has no data yet, it renders an empty-state message instead of crashing.

| Section | Source | Filtering applied |
|---|---|---|
| Resumen IA | `accounts.client_summary` (NEW) | Falls back to "Estamos preparando el resumen…" if null |
| Contexto | `accounts.{goals, startDate, serviceScope, industry, location, companyDescription, websiteUrl, linkedinUrl}` | **Fee always hidden.** No `industryCategory` (internal taxonomy). |
| Última reunión | Most recent `transcripts` row by date | Only `title`, `recordedAt`, `aiSummary` (the per-meeting summary, which is already client-friendly). NEVER the raw transcript content. |
| Archivos | `context_documents` rows | Only `title` and `createdAt`. NEVER `extractedText` content. |
| Tareas | `tasks` not completed | `title`, `dueDate`, `status`. **No `assignedTo`** (internal). |
| Participantes | `participants` rows | `name`, `role`. **No email** (internal). |
| Señales | `signals` where `status = 'active'` AND `type IN ('upsell_opportunity', 'growth_opportunity')` | Risk and warning signals NEVER appear, even if section toggle is on. |
| CRM | `crm_deals` linked to account | Pipeline + stage. **No deal value** (internal). |
| Salud | `accountHealthHistory` strip chart | The chart only. `healthJustification` NEVER shown. |
| Paid media | `meta_campaigns`, `meta_ads`, `meta_insights_daily` | Use `public_name ?? name`. NO change-events. NO variants. |

The full account-detail page in the agency view is unchanged — these filters apply only to the public view's queries.

### Filtering helper
A single function `lib/queries/public-account.ts → getPublicAccountSnapshot(token, opts)` does:
1. Look up `account_share_links` by token; verify `is_active`.
2. Verify password (cookie or fresh form submission).
3. Verify rate-limit not tripped.
4. Load only the sections enabled in `share_config`.
5. Apply field-level redaction (fee, deal_value, justifications, etc.).
6. Update `view_count + 1` and `last_accessed_at = now()` (best-effort, never blocks render).
7. Return a strongly-typed `PublicAccountSnapshot` object.

This single helper is the boundary — nothing else in the public route can query account data directly. That keeps the redaction rules in one place.

## Agency-side configuration UI

A new collapsible card in the account detail page, between the header and the AI Summary card. Heading: "Vista pública". Owner/admin/account-owner only.

**Collapsed state (no link generated yet):**
```
[ Generar link público ]   "El cliente verá un dashboard read-only de su cuenta."
```

**Expanded state (link exists):**
- Active/Paused toggle ("Pausado" → public URL returns 404)
- Copyable URL with copy-to-clipboard button
- Password section:
  - If no password: input + "Setear contraseña" button
  - If password set: "Contraseña configurada" + "Cambiar" + "Quitar"
- Module visibility: 10 toggles, one per section (see ShareConfig table above)
- Stats: "X visitas · última hace Y" (or "Sin visitas todavía")
- Danger zone: "Regenerar link" (with confirm; invalidates old token + cookie) + "Eliminar"

### Server actions
- `createShareLink(accountId)` → returns the new token
- `updateShareConfig(linkId, config)`
- `setSharePassword(linkId, password | null)` → bumps `password_version`
- `regenerateShareToken(linkId)` → new token + bumps `password_version`
- `toggleShareLinkActive(linkId, active)`
- `deleteShareLink(linkId)`

All check `assertCanWriteAccount` (existing helper) before doing anything.

## Paid media name overrides

In the agency-side paid media section (`components/paid-media/...`), each campaign and ad row gets:
- A small pencil icon button next to the displayed name.
- Click → inline input replaces the name; Enter to save, Esc to cancel.
- After save: original name shown as the primary label, with a small gray caption underneath: `Público: {public_name}` if set.
- Empty `public_name` (after editing to blank) clears the override → public view falls back to `name`.

Server actions:
- `setPublicCampaignName(campaignId, publicName: string | null)`
- `setPublicAdName(adId, publicName: string | null)`

The public view component reads `campaign.public_name ?? campaign.name` and `ad.public_name ?? ad.name` everywhere.

## Client summary generation

The existing `generate-summary` Trigger.dev task currently produces a single `aiSummary` plus `accountSituation` (per the B sub-project rewrite). It will be extended:

**Input:** unchanged.

**Output JSON schema (extended):**
```json
{
  "aiSummary": "...",
  "accountSituation": { ... },
  "clientSummary": "..."   // NEW
}
```

**Prompt addition:** after the existing instructions, append:
> Adicionalmente, generá un campo `clientSummary` con un resumen alternativo dirigido AL CLIENTE FINAL (no a la agencia). Tono presente, hechos avanzados, sin ansiedades internas, sin críticas. Estilo: "Esta semana avanzamos en X", "Tenemos pendiente Y", "Vamos a coordinar Z para la próxima semana". Sin emojis. Sin mencionar señales de riesgo, salud de cuenta, o métricas internas. 2-4 oraciones.

The task writes both `aiSummary` and `clientSummary` to `accounts` in the same UPDATE.

When a public view loads and `client_summary` is null (account has no transcripts processed yet), the section shows: "Estamos preparando el resumen de tu cuenta. Volvé en unos minutos."

## Performance + caching

- The public view does the same number of queries as the private view but with a smaller payload (only enabled sections). With Vercel `gru1` + Supabase `sa-east-1` co-location, expected TTFB <800ms.
- No edge caching at the route level — content needs to be live, and the password gate must run server-side.
- `view_count` increment is fire-and-forget (non-awaited, in a `try/catch`) so DB latency on that update never affects render.

## Security considerations

- Token: 32 random URL-safe chars = 192 bits of entropy. Brute-forcing the token space is infeasible.
- Password: bcrypt cost 10. Rate limit on failed attempts (per-token in-memory). For MVP this is enough; if abuse is observed, upgrade to a Postgres-backed counter.
- Cookie: signed with the existing `NEXTAUTH_SECRET` (or equivalent app secret). Includes `{ token, password_version, exp }`. Verified before reading account data.
- All public-view queries bypass Supabase RLS (they run as service-role server-side) because the auth model is the token, not Supabase auth. The redaction logic is in `getPublicAccountSnapshot`, not in RLS.
- `noindex` + `nofollow` so search engines don't crawl these.
- HTTPS-only cookie (Secure flag).

## Migrations

1. `0027_<name>` — new `account_share_links` table + new columns on `accounts`, `meta_campaigns`, `meta_ads`. Single migration with up + down.

## Files we'll touch / create

**New:**
- `lib/drizzle/schema/account_share_links.ts`
- `lib/queries/public-account.ts` — the redaction-aware loader
- `lib/share/token.ts` — token generation + cookie helpers
- `lib/share/password.ts` — bcrypt + rate limit
- `app/(public)/c/[token]/page.tsx` — the public view
- `app/(public)/c/[token]/password-gate.tsx` — password form
- `app/(public)/c/[token]/layout.tsx` — minimal shell
- `app/actions/share-links.ts` — agency-side server actions
- `components/account-share-section.tsx` — the agency-side config UI
- `components/public-account-view/*.tsx` — public view sections (mirror the private ones but read-only and filtered)

**Modified:**
- `lib/drizzle/schema/accounts.ts` — add `clientSummary`, `clientSummaryUpdatedAt`
- `lib/drizzle/schema/meta_campaigns.ts` + `meta_ads.ts` — add `publicName`
- `trigger/tasks/generate-summary.ts` (or wherever the summary task lives) — extend output schema + prompt
- `app/(protected)/app/accounts/[accountId]/page.tsx` — mount the new agency-side share config section
- `components/paid-media/...` (campaign and ad rows) — add inline-edit for `public_name`

## Implementation order

1. Schema + migration (account_share_links, public_name x2, client_summary x2)
2. Token + password + cookie utilities
3. Public route + minimal layout + password gate
4. `getPublicAccountSnapshot` with redaction logic
5. Public view sections (per module, gated by `share_config`)
6. Agency-side share config UI
7. Server actions (create/update/regen/delete)
8. Paid media inline rename UI
9. Extend `generate-summary` task to produce `clientSummary`
10. Smoke test end-to-end + ship

## Self-review

**Placeholder scan:** None — every section has concrete decisions.

**Internal consistency:** Public view sections list, share_config keys, and filter logic all line up. `password_version` is mentioned in cookie payload, schema, and rotation triggers — consistent. The `paid_media` toggle on `share_config` controls whether the entire paid-media section renders; the `public_name` rename works inside it regardless of toggle (an edited name doesn't reveal the section if hidden).

**Scope check:** Single coherent feature. ~10 files, ~1 migration, 1 LLM prompt extension. Implementable as one plan.

**Ambiguity check:**
- "Last meeting" = most recent `transcripts` row by `recordedAt` (or `createdAt` as fallback). Locked.
- "Files" shows `context_documents` only, not the legacy `transcripts` (those go to "Última reunión"). Locked.
- Signals filter: when section is on, only `upsell_opportunity` and `growth_opportunity` types render — risk/warning never. Locked.
- "Stats: visits" shows `view_count` and `last_accessed_at` from the share_links row, not aggregated from any audit log.
