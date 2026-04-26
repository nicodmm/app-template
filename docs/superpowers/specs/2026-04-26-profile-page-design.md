# Profile page

**Date:** 2026-04-26
**Owner:** nicodmatutem@gmail.com
**Surface:** `/app/profile` (currently 404 — link exists in sidebar + app-header)

## Goal

Build the missing profile page so users can set a display name (which propagates everywhere via the existing `fullName ?? email` fallback) and change their password. Keep scope tight: avatar upload, email change, account deletion, and 2FA are explicitly deferred.

## Sections (top to bottom)

### 1. Header card

Glass tile spanning full width.

- Avatar circle on the left — same first-letter-of-displayName style used by `app-header` (no image upload yet).
- Display name on the right (`fullName` or "Sin nombre" italic muted).
- Email below the name, muted.
- Role badge (Owner / Admin / Miembro) inline with the email, glass pill.

### 2. Datos personales

Glass card with `<ProfileNameForm>` (client component, server-action submit).

- Single field: **Nombre completo** (`users.fullName`).
- Save button disabled while pristine; success toast not used (Server Action returns `{ success, error }`, page revalidates and re-renders the new name in the header).
- Email shown read-only with the note: *"Para cambiar tu email escribinos a hola@nao.fyi."* — no input, just a `<p>` with the value and the note.

### 3. Cambiar contraseña

Glass card with `<ProfilePasswordForm>` (client component, server-action submit).

Fields:
- Contraseña actual
- Nueva contraseña
- Confirmar nueva

Client-side validation: nueva ≥ 8 chars, nueva ≠ actual, confirm matches.

Server action `updateUserPassword(currentPassword, newPassword)` flow:
1. Look up the current user's email via `supabase.auth.getUser()`.
2. Re-authenticate with `supabase.auth.signInWithPassword({ email, password: currentPassword })` — this verifies the current password without requiring it from the DB.
3. If re-auth fails, return `{ success: false, error: "Contraseña actual incorrecta" }`.
4. If re-auth succeeds, call `supabase.auth.updateUser({ password: newPassword })`.
5. On success, return `{ success: true }`. The form clears all 3 fields and shows an inline success message.

Inline-success / inline-error are rendered above the form, matching the pattern in `app/(auth)/reset-password/page.tsx`.

### 4. Mi workspace

Glass card, read-only.

- **Workspace:** name from `workspaces.name`
- **Tu rol:** "Owner" / "Administrador" / "Miembro" (mapped from the role string)
- **Miembro desde:** formatted `workspace_members.createdAt` ("Abril 2026")
- "Ir a configuración del workspace →" link to `/app/settings/workspace` shown only when role is owner/admin.

### 5. Sign-out button

Plain glass button at the bottom of the page, right-aligned.
- Same client-side flow as the one in `app-header.tsx` (Supabase signOut + redirect to `/auth/login`).
- Repeats existing functionality but is conventional on a profile page.

## Files

| Path | Action | Responsibility |
|---|---|---|
| `app/(protected)/app/profile/page.tsx` | Create | Server Component: auth check, fetch user + workspace + member, render sections |
| `components/profile-name-form.tsx` | Create | Client form for `fullName` editing |
| `components/profile-password-form.tsx` | Create | Client form for password change with validation |
| `components/profile-signout-button.tsx` | Create | Client button reusing the supabase client signOut pattern |
| `app/actions/profile.ts` | Create | `updateUserName`, `updateUserPassword` server actions |

No schema migrations. No new dependencies.

## Validation rules

- `fullName`: trimmed; max 120 chars; allow empty (clears the field, falls back to email everywhere).
- New password: ≥ 8 chars, ≠ current password.
- Confirm: must equal new password.
- All validation runs both client-side (UX) and server-side (security).

## Error handling

Server actions return `{ success: boolean; error?: string }`. Forms render the error inline with the same destructive style the auth pages use. No toasts (consistent with the rest of the app per CLAUDE.md: "No toasts in Server Actions").

## Out of scope

- Avatar upload (requires Supabase Storage setup — separate sub-project).
- Email change (requires Supabase verification flow on both old + new email — separate sub-project).
- Account deletion (heavy + dangerous — separate sub-project).
- 2FA, session management, notification preferences — no clear use case yet.

## Verification

- `npm run type-check` clean
- Manual walkthrough on `/app/profile`:
  - Page renders the header card with my email + role
  - Name form: setting a name updates the header card and propagates to the dashboard "Top actividad" / signal authors / workspace member list
  - Password form: wrong current password shows an error; matching password change succeeds and the new password works on next login
  - Workspace card shows the right info; "Ir a configuración" only appears for owner/admin
  - Sign-out button signs me out and redirects to `/auth/login`
  - No console errors

## Constraints

- Server Component for the page (auth gate + data fetch); client islands only for the 3 form/button components.
- Auto-push after every commit (workspace convention).
- Type-check is the gate (lint is non-functional in this repo).
