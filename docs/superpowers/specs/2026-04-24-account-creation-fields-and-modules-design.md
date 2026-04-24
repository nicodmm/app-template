# Sub-project A — Account creation fields + module toggles

**Date:** 2026-04-24
**Status:** Design (auto-mode, approved to execute)
**Parent scope:** plani.fyi UX refresh (multi-sub-project initiative — see user conversation 2026-04-24)

---

## Goal

Make new-account creation capture three additional pieces of context, and let the user turn modules on/off per-account (from both the create and edit forms). This sub-project is foundational for later work (Sub-project B needs `start_date` and `fee` for the "Resumen de situación" prompt; Sub-project C needs `enabled_modules` to know whether to render the scraping module).

## Out of scope

- Fee complexity (currency, frequency, contract history). User decision: "de momento dejamos todo lo relativo de fee sin mucho esfuerzo luego lo resolvemos." A single numeric column is enough.
- Changing behaviour of the gated modules themselves — they just get wrapped in conditional rendering.
- Pricing/quota enforcement tied to modules or account count (user: "no pongamos limites por pricing").

## Scope summary

1. **Schema:** add `start_date`, `fee`, `enabled_modules` to `accounts`.
2. **Modules catalog:** one client-safe source of truth listing every toggleable module.
3. **Create form + action:** three new inputs, module toggle checklist.
4. **Edit form + action:** same three inputs + toggle checklist.
5. **Detail page:** gate each module section on `isModuleEnabled`. Show start date + fee in the "Contexto de la cuenta" section.
6. **Quota gate:** remove the hardcoded `Free = 2 accounts` limit in `createAccount`.

## Data model

### Schema changes (`lib/drizzle/schema/accounts.ts`)

```ts
startDate: date("start_date"),                       // nullable
fee: numeric("fee", { precision: 12, scale: 2 }),    // nullable
enabledModules: jsonb("enabled_modules")
  .$type<Partial<Record<AccountModuleKey, boolean>>>()
  .default({}),                                       // default {} = "all ON by fallback"
```

### Migration strategy

- Generate via `npm run db:generate`.
- Write a `down.sql` that drops the three columns.
- All three columns are nullable/defaulted, so existing rows are unaffected.

### Read semantics for `enabled_modules`

Stored as a sparse object: only keys the user has explicitly toggled get written. `isModuleEnabled(account, key)` returns `true` unless the key is explicitly `false`. This means:

- New accounts with `{}` → all modules on.
- Toggling a module off → `{ crm: false }`.
- Toggling it back on → key is removed (or set `true`; both work).

This keeps payloads small and avoids migration churn when we add more modules in Sub-projects C–F.

## Modules catalog

New file `lib/modules-client.ts` (client-safe — used by form components):

```ts
export const ACCOUNT_MODULES = [
  { key: "crm",            label: "CRM (Pipedrive)" },
  { key: "paid_media",     label: "Paid Media (Meta Ads)" },
  { key: "context_upload", label: "Subir contexto" },       // will rename in Sub-project D
  { key: "tasks",          label: "Tareas" },
  { key: "participants",   label: "Contactos y participantes" },
  { key: "signals",        label: "Señales" },
  { key: "health",         label: "Evolución de salud" },
] as const;

export type AccountModuleKey = typeof ACCOUNT_MODULES[number]["key"];

export function isModuleEnabled(
  enabled: Partial<Record<AccountModuleKey, boolean>> | null | undefined,
  key: AccountModuleKey
): boolean {
  return enabled?.[key] !== false;  // default ON
}
```

Note: the "Resumen de situación" section and the "Contexto de la cuenta" section are NOT in the toggle list — they are considered core to every account.

## UI

### Create form (`app/(protected)/app/accounts/new/page.tsx`)

Add after the existing Scope section:

- `<Input type="date" name="startDate">` — optional.
- `<Input type="number" step="0.01" name="fee">` — optional. Label: "Fee mensual (USD)" as a placeholder-only hint.
- Module toggles — a compact checklist rendered by a new `<AccountModulesToggles>` client component. All checked by default on create.

### Edit form (`components/edit-account-form.tsx`)

Same three inputs, prefilled from `account.startDate`, `account.fee`, `account.enabledModules`.

### Detail page (`app/(protected)/app/accounts/[accountId]/page.tsx`)

- Contexto section: add a third grid cell showing `Fecha de inicio` and `Fee` when present. Keeps the visual grammar of the existing two cells.
- Each module block is wrapped in `{isModuleEnabled(account.enabledModules, "<key>") && <Section />}`. Specifically:
  - `paid_media` → `<PaidMediaMiniCard>`
  - `crm` → `<CrmMiniCard>`
  - `context_upload` → `TranscriptUploadForm` + `Historial de transcripciones` collapsible
  - `tasks` → `Tareas` collapsible
  - `participants` → `Contactos` collapsible
  - `signals` → `Señales` collapsible
  - `health` → `Evolución de salud` collapsible

## Server actions

### `createAccount` (`app/actions/accounts.ts`)

- Read `startDate` (string `"YYYY-MM-DD"` or `""`), `fee` (string, numeric), and repeated `enabledModules` values from `FormData`.
- Persist: `startDate` as is; `fee` as string (Drizzle numeric column round-trips as string); `enabledModules` built by walking `ACCOUNT_MODULES` — if a module's value is NOT in the posted list, write `false`, otherwise omit (defaults ON).
- Remove the `if (count >= 2) redirect(...)` quota check. Leave the `usage_tracking` sync.

### `updateAccount`

Same parsing logic. Keep `revalidatePath`.

## Verification

- `npm run type-check` clean.
- `npm run lint` clean.
- `npm run db:migrate` applies cleanly; `npm run db:rollback` reverses cleanly.
- Manual (user): create a new account with a start date, a fee, and CRM toggled off. Verify the profile page hides the CRM card. Edit the account, toggle CRM back on, verify it reappears.

## Risks / notes

- The `fee` column is a plain number and has no currency/frequency. Sub-project B's prompt rewrite will need to assume "monthly USD" until we formalise it.
- We're relying on the fact that `enabledModules` defaults to `{}` so old accounts stay "all on." If Drizzle's jsonb default doesn't backfill existing rows, the down migration and any manual SQL will need a `UPDATE accounts SET enabled_modules = '{}' WHERE enabled_modules IS NULL`. We'll add this to the migration's up.sql if needed.
- The decision to key off `enabled_modules` (vs. separate boolean columns) intentionally trades strictness for schema stability — Sub-projects D–F will add more toggleable modules and we don't want a migration for each.
