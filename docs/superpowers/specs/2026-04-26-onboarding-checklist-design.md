# Onboarding checklist

**Date:** 2026-04-26

## Goal

Reduce time-to-value for new owners/admins by surfacing a 4-step setup checklist on the portfolio. The state is fully derived from existing tables — no schema migration. The checklist auto-hides once all 4 steps are completed.

## Steps

| # | Title | Description | Done condition | CTA href |
|---|---|---|---|---|
| 1 | Configurá tu agencia | El AI usa este contexto para generar mejores señales. | `workspaces.agencyContext` is non-empty after trim | `/app/settings/workspace#agency-context` |
| 2 | Definí tus servicios | El catálogo de servicios sirve para etiquetar cuentas. | `workspaces.services.length > 0` | `/app/settings/workspace#services` |
| 3 | Creá tu primera cuenta | Cada cuenta representa un cliente. | At least one row in `accounts` for the workspace | `/app/accounts/new` |
| 4 | Subí tu primer contexto | Una transcripción o archivo dispara el análisis del AI. | At least one row in `transcripts` OR `context_documents` joined on accounts in this workspace | The detail of the most recent account, with `#subir-contexto` anchor (or `/app/portfolio` fallback when 0 accounts) |

## Visibility rules

- **Role gate:** owner and admin only. Members never see the checklist.
- **Auto-hide:** when all 4 are done, the component returns `null`. No dismiss button.
- **Surface:** rendered exclusively on `/app/portfolio`.
  - When `accounts.count === 0`: replaces the existing "Creá tu primera cuenta" empty state.
  - When `accounts.count > 0` but the checklist is incomplete: rendered as a banner above the grid.
  - When complete: rendered nowhere.

## Visual

A glass card (`variant="strong"` style with subtle primary tint border) containing:

- Top row: "Bienvenido a nao.fyi" + "X de 4 completados" + thin progress bar.
- 4 rows, each with:
  - Left: 24×24 circle. Empty when pending, filled with primary color + checkmark when done.
  - Middle: title (sm font-semibold) + 1-line description (xs muted).
  - Right: "Ir →" link button (hidden when done).
- When all 4 done the component returns null (visibility rules).

## Backend

New file `lib/queries/onboarding.ts` with one async function:

```ts
export interface OnboardingState {
  steps: {
    agency: boolean;
    services: boolean;
    account: boolean;
    context: boolean;
  };
  /** Account id of the most recently created account, or null when none exist. Used to deep-link step 4. */
  latestAccountId: string | null;
  completedCount: number;
  isComplete: boolean;
}

export async function getOnboardingState(
  workspaceId: string
): Promise<OnboardingState>;
```

Implementation:
1. Read workspace fields (`agencyContext`, `services`) — already in scope when the page resolves the workspace.
2. Query `accounts.count` and the most recent account id (single query, ORDER BY created_at DESC LIMIT 1).
3. Query whether any transcript or context_document exists for accounts in this workspace (single EXISTS-style query).

Total: 2 extra queries on top of existing portfolio fetches. Both run in parallel via `Promise.all`. Cheap.

## Files

| Path | Action |
|---|---|
| `lib/queries/onboarding.ts` | Create |
| `components/onboarding-checklist.tsx` | Create — receives `state` + `latestAccountId` as props, renders the UI |
| `app/(protected)/app/portfolio/page.tsx` | Modify — fetch onboarding state when `isElevated`, conditional render |
| `app/(protected)/app/settings/workspace/page.tsx` | Modify — wrap `<WorkspaceServicesSection>` and `<WorkspaceAgencyContextSection>` with anchor `<section id="...">` so the checklist links jump correctly |

## Out of scope

- Schema migration to track completion state explicitly
- "Dismiss" / "No mostrar más" button
- Onboarding analytics
- Coach marks / tooltips over existing UI
- "Invitá a tu equipo" 5th step

## Verification

- `npm run type-check` clean
- Manual:
  - As a brand-new owner: portfolio shows the checklist with 0/4 progress and replaces the empty state
  - Configure agency context → reload → step 1 ticks → 1/4
  - Add a service → step 2 → 2/4
  - Create an account → step 3 → 3/4
  - Upload a transcript → step 4 → 4/4 → checklist disappears
  - Member-role users never see the checklist
  - Anchor jumps land on the right sections of `/app/settings/workspace`
