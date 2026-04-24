# Sub-project F — Multi-user invitations + role-gated portfolio

**Date:** 2026-04-24
**Status:** Design (auto-mode, approved)
**Parent scope:** nao.fyi UX refresh

---

## Goal

Let a workspace owner/admin invite teammates by email. Invited users sign up, join the existing workspace (not create their own), and see the portfolio filtered by role: members only see accounts where they are the owner, admins/owners see everything.

## What's already in place

- `workspaces` table + `workspace_members` (role check: `owner` | `admin` | `member`).
- `createDefaultWorkspace` runs on signup confirm.
- `getWorkspaceByUserId` returns the first workspace the user belongs to (we treat users as single-workspace for now).
- `accounts.ownerId` already exists and is editable.

## What changes in this sub-project

### Schema

New table `workspace_invites`:

```ts
workspace_invites {
  id: uuid primary
  workspaceId: uuid → workspaces(id) cascade
  email: text (lowercased)
  role: text check in ('admin','member') — owners are not invited
  token: text unique (random 40-char hex)
  invitedByUserId: uuid → users(id) set null
  createdAt, expiresAt: timestamp
  acceptedAt: timestamp nullable
  acceptedByUserId: uuid → users(id) set null
}
```

Index: `(workspaceId, email, acceptedAt)` to quickly find pending invites for an email.

No changes to existing tables.

### Invite link flow

- Owner/admin submits invite → we insert a pending invite with `expiresAt = now + 7 days` and surface the **link** in the UI:
  `https://nao.fyi/app/invites/{token}`
- No email sent from the app yet. The inviter copies the link and shares it themselves (WhatsApp, email, Slack).
- `/app/invites/[token]` — a public-ish route:
  - Not authed → redirect to `/auth/signup?invite={token}`. Signup page forwards the token through the Supabase `emailRedirectTo` so it survives the round-trip. On callback, `createDefaultWorkspace` is replaced by `acceptWorkspaceInvite(token)` when a token is present.
  - Authed & not already a workspace member → call `acceptWorkspaceInvite(token)` → redirect to `/app/portfolio`.
  - Authed & already a member somewhere else → show a clear error ("Cerrá sesión y registrate con otra cuenta para unirte a este workspace"). We intentionally do NOT auto-replace memberships.

### Workspace settings page

New `/app/settings/workspace`:

- Workspace name editor (owner+admin only).
- Members list: display name, email, role, "change role" dropdown, "remove" button. Owner cannot be removed. A non-owner cannot demote the owner.
- Pending invites list: email, role, invited-by, "copy link" button, "revoke" button.
- Invite form: email + role (admin or member). On submit → creates invite → shows the copyable link inline.

Link this from the existing profile dropdown / existing `/app/settings/integrations` page.

### Portfolio gating

Change `getPortfolioAccounts(workspaceId)` → `getPortfolioAccounts(workspaceId, userId, role)`:

- If `role in ("owner","admin")`: return all workspace accounts (current behavior).
- Else: return only accounts where `ownerId = userId`.

Same treatment for `getAccountById` — reject if member is trying to read an account they don't own.

### Permissions matrix

| Action | Owner | Admin | Member |
|---|---|---|---|
| See all accounts in workspace | ✅ | ✅ | Only own |
| Create account | ✅ | ✅ | ✅ |
| Edit/delete any account | ✅ | ✅ | Only own |
| Invite users | ✅ | ✅ | ❌ |
| Change member role | ✅ | ✅ (but can't touch owner) | ❌ |
| Remove member | ✅ (not self) | ✅ (not owner) | ❌ |
| Rename workspace | ✅ | ✅ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ |

Ownership transfer is NOT in this pass (can be added later; owner stays the signup user for now).

## Out of scope (future)

- Actual email sending on invite (use Resend or SendGrid).
- Multi-workspace per user with a switcher.
- Per-account permission grants beyond the "owner = full access" model.
- Audit log of membership changes.

## Verification

- type-check + build
- Manual (user): owner signs up → invites a second email → copies link → opens incognito → signs up via link → lands in the SAME workspace → creates an account → sees only own account; owner logs back in → sees both.
