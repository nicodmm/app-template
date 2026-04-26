# Account CSV import

**Date:** 2026-04-26

## Goal

Let users bulk-create accounts by pasting a CSV (or uploading a `.csv` file). Lowers the friction for agencies migrating from spreadsheets/Notion. MVP: insert-only (no update / re-import).

## UX

- New page `/app/accounts/import` with:
  - File input (accepts `.csv`, `.tsv`, `.txt`) that reads into the textarea.
  - Textarea (large, monospace) where the CSV/TSV lives.
  - Hint block listing supported columns + a small example.
  - "Importar" button → server action.
  - Error surface above the form: per-row errors (line number + reason) when validation fails; success summary on success ("Se crearon N cuentas").
- Entry point: "Importar CSV" button next to "Nueva cuenta" on the portfolio page.

## Supported columns

First row must be headers. Header matching is **case-insensitive and trim-tolerant**, with synonyms:

| Field | Headers (any of) | Required | Notes |
|---|---|---|---|
| `name` | `name`, `nombre`, `cuenta`, `cliente`, `account` | ✅ | The only required column |
| `email` | `email`, `responsable`, `owner`, `am` | – | Looked up against workspace members; nullable on miss |
| `fee` | `fee`, `monto`, `precio`, `tarifa` | – | Parsed as float, null on parse failure |
| `start_date` | `start_date`, `startdate`, `fecha_inicio`, `inicio` | – | Accepts `YYYY-MM-DD` or `DD/MM/YYYY` |
| `website` | `website`, `web`, `sitio`, `url` | – | Falls back to `https://` if missing scheme |
| `linkedin` | `linkedin`, `linkedin_url` | – | Same URL parsing |
| `goals` | `goals`, `objetivos` | – | Free text |
| `service_scope` | `service_scope`, `servicios`, `scope`, `services` | – | Semicolon-separated list (avoids CSV comma conflict) |

Rows missing `name` are reported as errors and skipped; the rest are inserted.

## Parsing

Custom minimal CSV parser at `lib/csv-parser.ts` — no new deps. Supports:
- LF and CRLF line endings.
- Quoted values with `"` (RFC 4180 style: doubled quotes `""` escape a literal quote).
- Comma OR tab as field separator (auto-detected from the header row).

Limit: 1000 rows per import. If the user pastes more, the action returns an error asking them to split.

## Server action

`app/actions/accounts-import.ts` exports `importAccountsFromCsv(formData): Promise<ImportResult>`:

```ts
type ImportResult =
  | { success: true; created: number; warnings: ImportWarning[] }
  | { success: false; error: string; rowErrors?: RowError[] };

type RowError = { line: number; reason: string };
type ImportWarning = { line: number; field: string; reason: string };
```

Flow:
1. Read auth + workspace + role.
2. Read `csv` text from formData.
3. Parse → array of rows with normalized field keys.
4. Resolve `email → ownerId` map by querying workspace members once.
5. Validate each row, build `NewAccount[]` with defaults.
6. Single `db.insert(accounts).values(rows).returning({ id })`. (Atomic — if it fails, nothing is inserted.)
7. Update `usage_tracking.accounts_count` once at the end.
8. `revalidatePath("/app/portfolio")`. Return result.

Defaults applied to each imported row:
- `enabledModules = {}` (workspace defaults; user toggles per account later)
- `healthSignal = "inactive"`
- `enrichmentStatus = null` (auto-enrichment NOT triggered for MVP — user can hit "Re-enriquecer" per account if needed)
- `ownerId = matched member, else null`

## Files

| Path | Action |
|---|---|
| `lib/csv-parser.ts` | Create — minimal parser, no deps |
| `app/actions/accounts-import.ts` | Create — server action |
| `app/(protected)/app/accounts/import/page.tsx` | Create — wraps the form + breadcrumb |
| `components/csv-import-form.tsx` | Create — client form (paste textarea, file input, submit, error display) |
| `app/(protected)/app/portfolio/page.tsx` | Modify — add "Importar CSV" link next to "Nueva cuenta" |

## Out of scope

- Update existing accounts on duplicate name (insert only — duplicates allowed since names aren't unique).
- Excel `.xlsx` parsing (CSV/TSV only).
- Auto-enrichment of imported accounts with website (defer — manual button per account).
- Custom column mapping UI (only auto-detect by synonyms).
- Undo / batch delete (defer; user can archive or delete individually if needed).

## Verification

- `npm run type-check` clean
- Manual:
  - Paste a 3-row CSV with valid headers → 3 accounts created, redirect to portfolio
  - Paste a row with missing `name` → that row reported as error, others still imported
  - Use semicolons in `service_scope` → arrives correctly comma-joined in DB
  - Use TSV (tabs) → parsed correctly
  - Try pasting > 1000 rows → error message
