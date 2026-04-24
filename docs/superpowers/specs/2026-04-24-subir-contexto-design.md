# Sub-project D — "Subir contexto" (rename + context documents + Drive)

**Date:** 2026-04-24
**Status:** Design (auto-mode, approved)
**Parent scope:** nao.fyi UX refresh

---

## Goal

Re-frame the transcript upload module as a broader "Subir contexto" surface that holds any artifact relevant to an account — transcripciones, mensajes escritos, presentaciones, reportes — and eventually pulls Drive files automatically. The AI summary prompt (Sub-project B) then gets richer fact input beyond meeting transcripts.

## Decomposition

- **D1 (this pass):** rename the module, add `context_documents` table for non-transcript artifacts, new upload UI (tabs), display on account detail, feed summaries into the prompt. Local upload only. Keeps the existing transcript pipeline untouched.
- **D2 (deferred):** Google Drive integration. Requires user to create a Google Cloud project + OAuth credentials + Drive API scope grants. Designed below as a follow-up.

## D1 — Scope

### Data model

New table `context_documents`:

```ts
export const contextDocuments = pgTable("context_documents", {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: uuid().notNull().references(() => accounts.id, { onDelete: "cascade" }),
  uploadedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),

  docType: text().notNull(),          // "note" | "presentation" | "report" | "spreadsheet" | "other"
  title: text().notNull(),            // user-supplied title (or filename)
  notes: text(),                      // user-supplied description / excerpt / message body
  fileName: text(),                   // original filename if applicable
  mimeType: text(),
  fileSize: integer(),
  extractedText: text(),              // best-effort extracted text (for text-extractable formats)

  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});
```

Notes:
- No file-blob storage in DB. For non-transcript binaries (Excel, PPT, images), we only keep metadata + user-written notes. Later we can wire Supabase Storage if file preview becomes necessary.
- `docType` is text (not enum) to avoid migration churn if we add types.

### UI rename + new tabs

`TranscriptUploadForm` becomes `ContextUploadForm`. Three tabs:

1. **Transcripción** — identical to today's "Pegar texto" / "Subir archivos" flow, goes through the existing transcript pipeline (processing, AI summary, participants, signals).
2. **Nota o mensaje** — paste-only text. `docType = "note"`, `title` auto-built from the first line or user-provided, `notes` = text body. No AI processing, just persisted.
3. **Archivo** — drag-drop for non-transcript artifacts (.xlsx, .pptx, .pdf, images, etc.). Auto-classify `docType` from extension (heuristic). Extract text where possible (PDF via pdfjs-dist, DOCX via mammoth). Title = filename, notes optional.

Section header: **Subir contexto** (was "Subir transcripción").

### Detail page display

New collapsible `Archivos de contexto` under the existing `Historial de transcripciones` (both gated by the existing `context_upload` module toggle). Shows type icon + title + doc type + date + delete button.

### Summary prompt integration

Extend `generate-summary.ts`'s `buildAccountFactsBlock` to append a short "Contexto adicional" section listing the most recent 5 context docs (title + type + first ~200 chars of notes/extractedText). This gives Claude extra ground truth beyond transcripts.

## D2 — Google Drive integration (deferred, designed here)

### High-level

- Per-workspace Drive connection (workspace_id, refresh_token, drive_folder_id).
- Scheduled Trigger task (every 30 min) lists new files in the folder.
- Matching rule: filename **contains** the account name (case-insensitive, diacritic-tolerant). User keeps a naming convention like `[Acme Corp] Reunion 2026-04-20.docx`. Files that don't match any account go to a "unmatched" bucket the user can triage.
- Matched transcript-shaped files (.docx, .pdf, google-doc) feed the transcript pipeline. Other files become `context_documents` with `docType` guessed from mime type.
- Per-file dedup via `google_drive_file_id`.

### Schema sketch

- `drive_connections` table (workspaceId, refreshToken, folderId, folderName, status, etc.)
- `transcripts.googleDriveFileId` + `context_documents.googleDriveFileId` (nullable, unique)

### OAuth

- Google Cloud Console → project → OAuth consent screen (External, scopes: `https://www.googleapis.com/auth/drive.readonly`).
- App-level OAuth client (web type). Redirect URI: `https://nao.fyi/api/auth/google/callback`.
- User flow: `/app/settings/integrations` → "Conectar Google Drive" → pick folder.

### Runbook (user side, when we ship D2)

1. Google Cloud Console → **APIs & Services → Enabled APIs** → enable **Google Drive API**.
2. **Credentials → Create Credentials → OAuth 2.0 Client ID** → Web application.
3. Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`, `https://nao.fyi/api/auth/google/callback`.
4. Copy client ID + secret → set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` in `.env.local` and Vercel.
5. OAuth consent screen → add user's email to test users (until app verified).
6. In nao.fyi, connect Drive; pick the monitoring folder.

### Why deferred

- Non-trivial OAuth + cron + matching logic; medium implementation risk.
- Google Cloud setup is user action; can't be automated.
- D1 by itself already delivers the rename + context-file upload value the user described.

## Verification (D1)

- `npm run type-check` clean
- `npm run build` clean
- Manual (user): upload a transcript (old flow still works), create a Nota, upload a non-transcript file, confirm the Archivos de contexto section shows them, confirm the next transcript's Resumen de situación references them.
