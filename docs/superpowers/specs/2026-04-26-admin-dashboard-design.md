# Admin (platform) dashboard

**Date:** 2026-04-26

## Goal

A platform-level dashboard for the nao.fyi owner — distinct from the workspace dashboard at `/app/dashboard` which is per-tenant. Surfaces aggregated metrics across all workspaces so I can see usage, growth, and which tenants are actually engaged.

## Auth model (existing)

- `users.role` (global, default `"member"`) controls platform-admin access.
- `requireAdminAccess()` in `lib/auth.ts` redirects non-admins to `/unauthorized`.
- Middleware already protects `/admin/*`.
- To grant access: update a user's `users.role = 'admin'` directly in DB.

**Bug in scope:** the sidebar currently shows the Admin section when **workspace role** is owner/admin, not when the global `users.role` is admin. This results in dead links for regular workspace owners. Fix as part of this pass.

## What gets shown (MVP)

Single page `/admin/dashboard` with KPI tiles + activity table. All read-only.

### Top KPI grid (6 tiles)

| Tile | Source |
|---|---|
| Workspaces totales | `count(workspaces.id)` |
| Workspaces nuevos (30d) | `count where created_at > now() - 30d` |
| Usuarios totales | `count(users.id)` |
| Usuarios nuevos (30d) | `count where created_at > now() - 30d` |
| Cuentas totales | `count(accounts.id where closed_at IS NULL)` |
| Transcripciones procesadas (30d) | `count(transcripts where status = 'completed' AND created_at > now() - 30d)` |

### Top 10 workspaces by activity (last 30 days)

Table:
- Workspace name
- Owner email (display name fallback)
- # accounts
- # transcripts (last 30d)
- # signals active
- Last activity (max of relevant tables)

Click a workspace name → no detail page yet (just visual; expanding is future work).

## Out of scope (defer)

- LLM token / cost tracking (no infra for it yet)
- DB size / storage usage
- Historical time-series charts (only 30d snapshots)
- User management actions (delete user, force password reset, impersonation)
- Workspace detail view from the table click
- Trigger.dev failure metrics (would need to query Trigger API)
- Billing-related metrics

These come later if/when admin needs grow.

## Files

| Path | Action |
|---|---|
| `lib/queries/admin.ts` | Create — `getAdminDashboardMetrics()` returning the typed object |
| `app/admin/layout.tsx` | Create — auth gate via `requireAdminAccess()`, simple header with logo + back-to-app |
| `app/admin/page.tsx` | Create — redirect to `/admin/dashboard` |
| `app/admin/dashboard/page.tsx` | Create — render KPI grid + table |
| `app/(protected)/layout.tsx` | Modify — pass `isPlatformAdmin` flag to sidebar |
| `components/sidebar.tsx` | Modify — gate admin section on `isPlatformAdmin` (not workspace role); add "Dashboard" link |

## Verification

- `npm run type-check` clean
- Manual:
  - As a regular workspace owner: sidebar admin section is NOT visible
  - Set my user `users.role = 'admin'` in Supabase → admin section appears with "Dashboard"
  - Visit `/admin/dashboard` → see the 6 KPI tiles + top 10 workspaces table populated
  - Visit `/admin/dashboard` as a non-admin → redirect to `/unauthorized`
  - All tile values match what's in the DB
