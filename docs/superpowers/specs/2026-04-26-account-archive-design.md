# Account archive — surface existing infrastructure, lock down hard delete

**Date:** 2026-04-26

## Goal

The archive/reopen actions and `closedAt` schema already exist. The current UX hides archive inside the Edit form and exposes hard-delete prominently in the page header. Flip this: archive becomes the primary action (safe), hard delete moves behind a confirm-by-typing flow inside Edit > "Zona de peligro". Add a Portfolio tab to view archived accounts.

## Current state (verified)

- `accounts.closedAt` column exists, partial index `accounts_workspace_active_idx` covers `WHERE closed_at IS NULL`.
- Server actions exist and work: `closeAccount`, `reopenAccount`, `deleteAccount`.
- `getPortfolioAccounts` already accepts `includeClosed?: boolean` but no caller uses it.
- `<AccountCard>` already shows "Cerrado" badge + `opacity-60` when `closedAt !== null`.
- `<EditAccountForm>` has an inline `ProjectStatusToggle` that calls close/reopen with a `window.confirm`.
- Account detail header uses `<DeleteButton>` wired to `deleteAccount` (hard delete) — this is the loud problem.

## Changes

### 1. Account detail header

Remove `<DeleteButton>`. Add a new client component `<AccountStatusActions>` that renders one button conditional on `closedAt`:

- **Active** → "Archivar" (ghost / glass style) → calls `closeAccount` after `window.confirm("¿Archivar esta cuenta? Se quita del portfolio activo y del dashboard. Podés reabrirla cuando quieras.")`.
- **Archived** → "Reabrir" (primary) → calls `reopenAccount` directly (no confirm — reopen is non-destructive).

"Editar" link stays as-is for both states.

### 2. Archived banner on account detail

When `account.closedAt !== null`, render `<ArchivedAccountBanner closedAt={...} accountId={...} />` immediately below the breadcrumb (above the header). Glass tile with muted slate tint:

- Icon (`Archive` from lucide).
- "Esta cuenta está archivada desde {fecha en formato es-AR}. Las métricas no se actualizan."
- Inline "Reabrir cuenta" button (primary style) → `reopenAccount`.

### 3. Edit form refactor

Remove the existing "Estado del proyecto" block (lines ~229-244 in `edit-account-form.tsx`) and the `ProjectStatusToggle` helper (lines ~269-310). Replace with a new "Zona de peligro" block at the bottom of the form, ABOVE the submit/cancel buttons:

- Red-bordered glass panel (`[border:1px_solid_rgb(239_68_68/0.3)]`).
- Title "Zona de peligro" (text-destructive).
- Body: "Eliminar permanentemente borra la cuenta y todos sus datos asociados (transcripciones, contactos, señales, historial). Esta acción no se puede deshacer. Para archivar y conservar el histórico, usá el botón **Archivar** del header."
- Input field: "Para confirmar, escribí el nombre exacto de la cuenta: **{account.name}**".
- Button "Eliminar permanentemente" (destructive style, disabled until input matches `account.name` exactly, also disabled while pending).
- On click: call `deleteAccount(accountId)` directly (server action already redirects to `/app/portfolio`).

This is now the **only** way to hard-delete from the UI.

### 4. Portfolio tabs

Add `<PortfolioStatusTabs />` client component above the accounts grid:

- Two glass-tile tabs: "Activas ({n})" and "Archivadas ({n})".
- URL synced with `?status=active|archived` via `useSearchParams + router.push`.
- Default = `active` (matches current behavior when param is absent).

### 5. Portfolio page changes

In `app/(protected)/app/portfolio/page.tsx`:

- Read `?status=active|archived` from searchParams.
- Fetch BOTH active count and archived count in parallel (for the tab labels). Cheapest way: 2 small `count(*)` queries scoped by closedAt. Add a helper `getPortfolioAccountCounts(scope)` returning `{ active: number; archived: number }`.
- Pass `status` to `getPortfolioAccounts`.
- Render the new tabs with the counts, then the grid.

### 6. `getPortfolioAccounts` API change

Replace `includeClosed?: boolean` with `status?: 'active' | 'archived' | 'all'`. Default `'active'` (backwards compatible — current behavior).

```ts
export interface PortfolioScope {
  workspaceId: string;
  userId: string;
  role: string;
  status?: "active" | "archived" | "all";
}
```

Logic:
- `'active'` (default): `closedAt IS NULL`
- `'archived'`: `closedAt IS NOT NULL`
- `'all'`: no filter on `closedAt`

No caller currently passes `includeClosed`, so the change is safe.

### 7. Empty state on archived tab

When `status=archived` and 0 archived accounts: show "Aún no archivaste ninguna cuenta. Cuando archivés una, aparece acá." in a glass dashed panel (matching the existing empty state pattern from `app/(public)/page.tsx`).

## Files

| Path | Action |
|---|---|
| `lib/queries/accounts.ts` | Modify (`PortfolioScope.status`, add `getPortfolioAccountCounts`) |
| `app/(protected)/app/portfolio/page.tsx` | Modify (read searchParam, fetch counts, render tabs) |
| `app/(protected)/app/accounts/[accountId]/page.tsx` | Modify (header buttons, banner) |
| `components/edit-account-form.tsx` | Modify (remove status block, add danger zone) |
| `components/account-status-actions.tsx` | Create (Archivar/Reabrir button for header) |
| `components/archived-account-banner.tsx` | Create (banner on detail page) |
| `components/portfolio-status-tabs.tsx` | Create (Active/Archived tabs) |
| `components/account-danger-zone.tsx` | Create (confirm-by-typing delete inside Edit form) |

No schema migrations. No new dependencies.

## Out of scope

- Bulk archive/restore from portfolio
- Auto-archive after N days inactive
- Pausing Trigger.dev tasks for archived accounts (sync continues — out of scope per user)
- Account export before delete (defer until billing/GDPR pass)

## Verification

- `npm run type-check` clean
- Manual walkthrough:
  - Click "Archivar" on an active account → confirm → redirected back, account no longer in portfolio "Activas" tab, appears in "Archivadas" tab with badge + opacity
  - Open archived account → banner appears, "Reabrir cuenta" button works → reactivates
  - Edit form no longer has "Estado del proyecto" block; "Zona de peligro" appears at bottom
  - Delete button disabled until name typed exactly; once matched, click deletes hard and redirects
  - Dashboard counts unaffected (already filters `closedAt IS NULL`)
  - URL `?status=archived` persists on refresh
