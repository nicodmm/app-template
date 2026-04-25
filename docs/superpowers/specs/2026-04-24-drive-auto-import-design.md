# Sub-project D2 — Google Drive auto-import

**Date:** 2026-04-24
**Status:** Design + implementation (auto-mode)
**Parent scope:** nao.fyi UX refresh

---

## Goal

Stop forcing the user to upload transcripts manually. Instead: connect a Google Drive folder once, drop files there with the account name in the filename, and let nao.fyi pull them in every 30 minutes — transcripts go through the existing summary pipeline, other context files become `context_documents`.

## Decisions

- **Connection scope:** per workspace. One workspace = one connected Drive account = one watched folder. (Later we can lift this to per-account.)
- **Auth model:** offline OAuth with `refresh_token` so the cron task can refresh access without user interaction.
- **Scope:** `https://www.googleapis.com/auth/drive.readonly` — we only read, never write or delete.
- **Folder pick:** user picks a folder from a list (Drive API returns folders by query). Files anywhere in the picked folder root are eligible. We do NOT recurse into subfolders for v1.
- **Matching rule:** filename **contains** an account's name (case-insensitive, accent-insensitive). Files that don't match any account are skipped + logged. User keeps a naming convention like `[Acme Corp] Reunión 2026-04-22.docx`.
- **Type classification:**
  - `.docx`, `.pdf`, `.txt`, `.md`, Google Docs (`application/vnd.google-apps.document`) → **transcript**, fed into `process-transcript` workflow.
  - Everything else (`.xlsx`, `.pptx`, images, PDFs of presentations) → **context_document** with `docType` heuristic-classified.
- **Dedup:** track `googleDriveFileId` on both `transcripts` and `context_documents`. A file already imported is skipped on subsequent runs.
- **Cadence:** cron every 30 min. No webhooks (Drive Push requires HTTPS endpoint with verification — overkill for v1).

## Schema

### New table

```ts
drive_connections {
  id: uuid PK
  workspaceId: uuid → workspaces(id) cascade unique  // one Drive per workspace
  connectedByUserId: uuid → users(id) set null
  googleAccountEmail: text
  accessToken: text
  refreshToken: text
  tokenExpiresAt: timestamp
  folderId: text                  // null = not configured yet
  folderName: text                // for display
  status: text                    // "connected" | "error" | null
  lastSyncAt: timestamp
  lastError: text
  createdAt, updatedAt: timestamp
}
```

### Column additions

```ts
transcripts.googleDriveFileId: text (nullable, unique partial index where not null)
context_documents.googleDriveFileId: text (nullable, unique partial index where not null)
```

These let the sync task ask "have I already imported this Drive file?" with one query.

## OAuth flow

- `/api/auth/google/login`: authed only. Generate state cookie, build authorize URL with `access_type=offline&prompt=consent` (forces refresh_token issuance), redirect.
- `/api/auth/google/callback`: validate state, exchange code → tokens, fetch `userinfo` to record the email, upsert `drive_connections` for the workspace, redirect to `/app/settings/workspace?drive=connected`.

Reuses the existing pattern from `/api/auth/meta` and `/api/auth/crm` — same shape, same state-cookie strategy.

## UI in `/app/settings/workspace`

New section "Google Drive" between "Members" and "Invitar":

- **Not connected:** button "Conectar Google Drive".
- **Connected, no folder yet:** show email, list of folders from Drive (server-loaded), radio to pick one, "Guardar carpeta" button.
- **Connected with folder:** show email, folder name, last sync time, last error, "Sincronizar ahora" + "Cambiar carpeta" + "Desconectar".

Only `owner`/`admin` can manage Drive (member can't see this section).

## Cron sync task

`trigger/tasks/sync-drive-folder.ts`:

- For each `drive_connections.status='connected'` row with a `folderId`:
  1. Refresh access token if expired (Google's refresh endpoint).
  2. List files in the folder via Drive API: `files.list?q='FOLDER' in parents and trashed=false&fields=id,name,mimeType,modifiedTime`.
  3. Load the workspace's accounts (id + lowercased name).
  4. For each Drive file:
     - Skip if already imported (joined check on both tables).
     - Find matching account: lowercased + accent-stripped filename includes the lowercased + accent-stripped account name. If multiple match, pick the longest name (most specific).
     - If no match: log, skip.
     - If match:
       - Download content (Drive API `files.get?alt=media` or `files.export` for Google Docs to text/plain).
       - If transcript-shaped → call existing `processTranscript` workflow with the extracted text.
       - Else → insert directly into `context_documents` with the right `docType`.
       - Persist `googleDriveFileId`.
  5. Update `drive_connections.lastSyncAt = now()`, clear `lastError` on success or set on failure.

Schedule: `cron("*/30 * * * *")` for every 30 minutes. Trigger.dev v3 supports schedules natively.

## Setup runbook (user side, before this works in prod)

1. **Google Cloud Console** → create a project (or pick the existing one).
2. **APIs & Services → Library** → search "Google Drive API" → **Enable**.
3. **APIs & Services → OAuth consent screen** → **External** → fill app name "nao.fyi", support email, developer email. Save.
4. **Scopes** step → add `.../auth/drive.readonly`.
5. **Test users** → add your Gmail (until the app is verified by Google, only listed test users can OAuth).
6. **Credentials → Create Credentials → OAuth client ID**:
   - Type: **Web application**
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback`
     - `https://nao.fyi/api/auth/google/callback`
7. Copy **client ID** and **client secret**.
8. Set in **`.env.local`** AND in **Vercel env vars** (Production + Preview):
   ```
   GOOGLE_CLIENT_ID=<id>
   GOOGLE_CLIENT_SECRET=<secret>
   GOOGLE_OAUTH_REDIRECT_URI=https://nao.fyi/api/auth/google/callback   # use http://localhost:3000/... for .env.local
   ```
9. Set the same three vars in **Trigger.dev PROD** env (the cron task uses them).
10. Redeploy Vercel + run `npx trigger.dev@latest deploy`.

## Out of scope (next iteration)

- Per-account folder mapping ("Acme's transcripts go in `/Acme/`").
- Real-time webhooks (Drive Push notifications).
- Re-import / overwrite when a Drive file is edited (current behavior: import once, skip thereafter).
- Subfolder recursion.
- Match by participants metadata or file ACL.

## Verification

- type-check + build clean.
- Manual after creds + connection: drop a file `[Test Account] Reunión.docx` into the folder. Wait up to 30 min (or hit "Sincronizar ahora"). File appears in "Archivos de contexto" of the right account, transcript pipeline kicks in, summary updates.
