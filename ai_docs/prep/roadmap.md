# plani.fyi — Development Roadmap

**App:** plani.fyi
**Generated:** 2026-04-17
**Template:** worker-saas (Next.js 15, Supabase Auth, Drizzle ORM, Trigger.dev v4)
**Total Phases:** 11 (MVP — includes Paid Media integration)

---

## Phase Sequence Overview

| # | Phase | Key Unlock |
|---|---|---|
| 1 | Database Schema & App Foundation | App shell loads, workspace exists, user is logged in |
| 2 | Landing Page & Auth Flow | Marketing page live, all auth flows complete |
| 3 | Portfolio Dashboard & Account Management | User can see accounts, create/edit/delete them |
| 4 | Account Detail + Transcript Upload + AI Pipeline | Upload transcript → real-time AI processing → results |
| 5 | Participants & Contact Directory | Review AI contacts, confirm, manage vCard directory |
| 6 | Task Management | View AI tasks, complete/add/edit manually |
| 7 | Signals & Manual Updates | Manage health signals, add account notes |
| 8 | Transcript Detail Page | View per-transcript extraction detail |
| 9 | Profile, Billing & Usage | Profile, subscription check, usage stats, upgrade |
| 10 | Admin Dashboard & User Management | System metrics, user management |
| 11 | Paid Media Integration (Ad Metrics) | Connect ad platforms, sync metrics, campaign detail |

---

## Phase 1: Database Schema & App Foundation

**What you can DO after this phase:** Log in, see the app shell with sidebar navigation, workspace is auto-created on signup, all /app/* routes are protected.

### 1.1 — Modify existing `users` schema
- `lib/drizzle/schema/users.ts` — remove `role` field, add `avatar_url: text`

### 1.2 — Create new schemas (in migration order)
- `lib/drizzle/schema/workspaces.ts` — fields: id, name, slug (UNIQUE), stripe_customer_id, owner_id (FK users), created_at, updated_at
- `lib/drizzle/schema/workspace_members.ts` — fields: id, workspace_id (FK), user_id (FK), role CHECK('owner'|'admin'|'member'), created_at; UNIQUE(workspace_id, user_id)
- `lib/drizzle/schema/usage_tracking.ts` — fields: id, workspace_id (FK), month (date), transcripts_count, words_processed, accounts_count, updated_at; UNIQUE(workspace_id, month)
- Update `lib/drizzle/schema/index.ts` to export all new schemas

### 1.3 — Run migrations
- `npm run db:generate` after each schema file
- Create `drizzle/migrations/<name>/down.sql` for EVERY migration before running
- `npm run db:migrate` in FK dependency order: users → workspaces → workspace_members → usage_tracking

### 1.4 — Workspace auto-creation on signup
- Create `app/actions/auth.ts` — `createDefaultWorkspace(userId, email)`:
  - Creates workspace with slug derived from email
  - Creates workspace_members record with role 'owner'
  - Creates usage_tracking record for current month
- Wire into Supabase Auth callback: `app/auth/callback/route.ts`
- Create `lib/queries/workspace.ts` — `getWorkspaceByUser(userId)`, `getWorkspaceMember(workspaceId, userId)`

### 1.5 — Update middleware
- `middleware.ts` — extend protected routes to cover `/app/*` and `/admin/*`
- Redirect unauthenticated users to `/auth/login`
- Redirect authenticated users from `/` to `/app/portfolio` (if logged in)
- Admin routes: check `workspace_members.role = 'admin'` or users.role in DB; redirect to `/unauthorized` if not admin

### 1.6 — App layout + sidebar
- Create `app/(protected)/layout.tsx` — wraps all `/app/*` pages with sidebar + main content area
- Create `components/sidebar.tsx`:
  - Nav links: Portfolio (`/app/portfolio`), Perfil (`/app/profile`)
  - Admin section (role-gated): Dashboard (`/admin/dashboard`), Usuarios (`/admin/users`)
  - Footer: usage stats box — "X/Y transcripciones este mes" + plan badge + progress bar
  - Collapsible on mobile
- Create `components/mobile-nav.tsx` — bottom tab bar: Portfolio, Perfil
- Create `components/app-header.tsx` — logo (plani.fyi), avatar dropdown (profile, logout)
- Post-login redirect: update `app/(auth)/login/page.tsx` to redirect to `/app/portfolio`

### 1.7 — Workspace context provider
- Create `lib/workspace-context.tsx` — React context providing workspaceId, workspaceMember role
- Wrap `app/(protected)/layout.tsx` with provider

**Key files touched:** `lib/drizzle/schema/users.ts`, `middleware.ts`, `app/(auth)/login/page.tsx`
**New files:** `lib/drizzle/schema/workspaces.ts`, `workspace_members.ts`, `usage_tracking.ts`, `lib/queries/workspace.ts`, `lib/workspace-context.tsx`, `app/actions/auth.ts`, `app/(protected)/layout.tsx`, `components/sidebar.tsx`, `components/mobile-nav.tsx`, `components/app-header.tsx`

---

## Phase 2: Landing Page & Auth Flow

**What you can DO after this phase:** See plani.fyi marketing page with hero/features/pricing, complete all auth flows (signup, login, forgot password, verify email).

### 2.1 — Landing page
- `app/(public)/page.tsx` — full redesign:
  - Hero: "Siempre sabés cómo está cada cuenta — sin depender de la memoria del equipo"
  - Problem block: scattered info → memory dependency → operational cost
  - How it works: Upload transcript → AI extracts tasks/signals/summary → portfolio updated
  - 3-tier pricing cards: Free ($0) / Starter ($49) / Pro ($99) with feature lists
  - FAQ: supported formats, account limits, client view, data privacy
  - CTAs: "Empezá gratis" → `/auth/sign-up`

### 2.2 — Legal pages
- Create `app/(public)/privacy/page.tsx` — GDPR-compliant privacy policy
- Create `app/(public)/terms/page.tsx` — terms of service

### 2.3 — Auth pages branding + completion
- `app/(auth)/login/page.tsx` — plani.fyi branding, add Google OAuth button (configure in Supabase dashboard)
- `app/(auth)/signup/page.tsx` — plani.fyi branding, Google OAuth, auto-calls `createDefaultWorkspace()` on success
- `app/(auth)/reset-password/page.tsx` → rename/update to forgot-password flow
- Create `app/(auth)/verify-email/page.tsx` — email verification confirmation page
- Create `app/(auth)/layout.tsx` — centered auth layout with plani.fyi logo

### 2.4 — Public layout
- Create `app/(public)/layout.tsx` — public nav: logo + Login + Sign Up CTAs

**Key files touched:** `app/(public)/page.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`
**New files:** `app/(public)/privacy/page.tsx`, `app/(public)/terms/page.tsx`, `app/(auth)/verify-email/page.tsx`, `app/(auth)/layout.tsx`, `app/(public)/layout.tsx`

---

## Phase 3: Portfolio Dashboard & Account Management

**What you can DO after this phase:** See all accounts with health signal cards, create new accounts with goals and scope, edit account details, delete accounts.

### 3.1 — Accounts schema
- Create `lib/drizzle/schema/accounts.ts`:
  - Fields: id, workspace_id (FK), name, owner_id (FK users, SET NULL), goals (text), service_scope (text), health_signal CHECK('green'|'yellow'|'red'|'inactive'), health_justification, ai_summary, ai_summary_updated_at, last_activity_at, has_ad_connections (bool DEFAULT false), created_at, updated_at
  - Indexes: workspace_id, owner_id, (workspace_id, health_signal), (workspace_id, last_activity_at DESC)
- `npm run db:generate` + create down migration + `npm run db:migrate`
- Update `lib/drizzle/schema/index.ts`

### 3.2 — Lib queries
- Create `lib/queries/accounts.ts`:
  - `getPortfolioAccounts(workspaceId)` — returns accounts with task counts, open signals count
  - `getAccountById(accountId, workspaceId)` — full account detail with relations check
  - `searchAccounts(workspaceId, filters)` — filter by health signal, owner, last activity
  - `incrementAccountsUsage(workspaceId)` / `decrementAccountsUsage(workspaceId)` — updates usage_tracking

### 3.3 — Server actions
- Create `app/actions/accounts.ts`:
  - `createAccount({ name, goals, serviceScope, ownerId })` — validates workspace account quota, inserts, increments usage_tracking.accounts_count
  - `updateAccount({ accountId, ...fields })` — validates ownership, updates
  - `deleteAccount(accountId)` — cascades automatically, decrements usage_tracking.accounts_count
  - `updateHealthSignal({ accountId, signal, justification })` — manual override

### 3.4 — Portfolio dashboard page
- Create `app/(protected)/app/portfolio/page.tsx`:
  - Calls `getPortfolioAccounts()` server-side
  - Account grid: `components/account-card.tsx` per account
  - Filters toolbar: health signal badges (toggle), owner select, last activity (7d/30d)
  - Sort: risks first (default) / last activity / owner
  - Empty state: "Creá tu primera cuenta para empezar a gestionar tu cartera" + CTA
  - "Nueva cuenta" button → `/app/accounts/new`
- Create `components/account-card.tsx`:
  - Name, owner avatar, health signal badge (green/yellow/red/inactive), last activity relative time
  - Open tasks count, open signals count
  - "Sin actividad" badge if last_activity_at > 30 days
  - Click → `/app/accounts/[accountId]`

### 3.5 — Account creation
- Create `app/(protected)/app/accounts/new/page.tsx`:
  - Form: name (required), goals (textarea), service scope (textarea), assigned owner (workspace members select)
  - Submit → `createAccount()` → redirect to `/app/accounts/[accountId]`

### 3.6 — Account detail page (shell)
- Create `app/(protected)/app/accounts/[accountId]/page.tsx`:
  - Account header: name, health badge, owner, last updated
  - "Editar cuenta" button → inline edit or modal (name, goals, scope, owner)
  - "Eliminar cuenta" button → confirmation dialog → `deleteAccount()` → redirect to portfolio
  - AI summary block (empty state: "Procesá una transcripción para generar el resumen")
  - Placeholder sections for: Upload, Tasks, Signals, History (to be filled in Phase 4+)

**Key files:** `lib/drizzle/schema/accounts.ts`, `lib/queries/accounts.ts`, `app/actions/accounts.ts`
**New pages:** `app/(protected)/app/portfolio/page.tsx`, `app/(protected)/app/accounts/new/page.tsx`, `app/(protected)/app/accounts/[accountId]/page.tsx`

---

## Phase 4: Account Detail + Transcript Upload + AI Pipeline

**What you can DO after this phase:** Upload or paste a meeting transcript, watch 5-stage AI processing live with real-time progress, see extracted tasks/summary/signals/health signal update on the account. This is the core product value.

> **Environment prerequisites before starting:** Configure `TRIGGER_SECRET_KEY` and `ANTHROPIC_API_KEY` in `.env.local`.

### 4.1 — Additional schemas
- Create `lib/drizzle/schema/transcripts.ts` (combined job tracking + content + AI results):
  - Input: file_name, source_type CHECK('paste'|'file'), content, content_hash, word_count
  - Job tracking: trigger_job_id, status CHECK('pending'|'processing'|'completed'|'failed'|'cancelled') DEFAULT 'pending', progress_percentage DEFAULT 0, error_message
  - Output: meeting_summary
  - Relations: account_id (FK CASCADE), workspace_id, uploaded_by (FK SET NULL)
  - Indexes: account_id, status (partial: WHERE 'pending'|'processing'), (account_id, content_hash), (account_id, created_at DESC)
- Create `lib/drizzle/schema/tasks.ts`:
  - Fields: id, account_id, workspace_id, transcript_id (FK SET NULL), created_by (FK SET NULL), description, status CHECK('pending'|'completed'), source CHECK('ai_extracted'|'manual'), priority, completed_at, created_at, updated_at
  - Indexes: (account_id, status), workspace_id, transcript_id
- Create `lib/drizzle/schema/signals.ts`:
  - Fields: id, account_id, workspace_id, transcript_id (FK SET NULL), trigger_source CHECK('transcript_processing'|'ad_metrics_sync'|'manual'), type CHECK('churn_risk'|'growth_opportunity'|'upsell_opportunity'|'inactivity_flag'|'custom'), status CHECK('active'|'resolved') DEFAULT 'active', description, resolved_at, resolved_by (FK SET NULL), created_at, updated_at
  - Indexes: (account_id, type, status), (account_id, status), workspace_id
- Create `lib/drizzle/schema/account_health_history.ts`:
  - Fields: id, account_id, workspace_id, transcript_id (FK SET NULL), health_signal CHECK('green'|'yellow'|'red'|'inactive'), justification, created_at
  - Index: (account_id, created_at DESC)
- Run all migrations with down migrations; update `lib/drizzle/schema/index.ts`

### 4.2 — Custom SQL migration: signal dedup index
- `npm run db:generate:custom` — create migration for partial unique index:
  ```sql
  CREATE UNIQUE INDEX signals_one_active_per_type
    ON signals (account_id, type)
    WHERE status = 'active';
  ```
- Create corresponding down migration: `DROP INDEX signals_one_active_per_type;`
- `npm run db:migrate`

### 4.3 — Trigger.dev project setup
- Install: `npm install @trigger.dev/sdk @trigger.dev/nextjs @trigger.dev/react-hooks`
- Create `trigger/index.ts` — project configuration with TRIGGER_SECRET_KEY
- Create `app/api/trigger/route.ts` — Trigger.dev Next.js handler
- Update `next.config.ts` to include Trigger.dev config

### 4.4 — Transcript upload Server Action
- Create `app/actions/transcripts.ts` — `uploadTranscript({ accountId, content, fileName, sourceType })`:
  1. `requireUserId()` + validate workspace membership
  2. Query Stripe API (`lib/queries/subscriptions.ts`) for tier (3s timeout, fallback to 'free')
  3. Check `usage_tracking` against tier limits (transcript count + word count)
  4. If over quota: return `{ error: 'quota_exceeded', remaining: 0 }`
  5. Normalize content (trim, collapse whitespace, lowercase for hashing)
  6. SHA-256 hash via `crypto.createHash('sha256').update(normalizedContent).digest('hex')`
  7. Query `transcripts WHERE account_id = ? AND content_hash = ?`
  8. If duplicate: return `{ warning: 'duplicate', previousDate: transcript.createdAt }`
  9. Insert transcript record (status: 'pending')
  10. Call `tasks.trigger('process-transcript', { transcriptId, accountId, workspaceId, content })`
  11. Update `transcripts.trigger_job_id = run.id`
  12. Return `{ transcriptId, triggerJobId: run.id }`
- `retryTranscript(transcriptId)` — resets status to 'pending', re-triggers same transcriptId
- `deleteTranscript(transcriptId)` — deletes record (tasks/signals created by it are retained per spec)
- Create `lib/queries/transcripts.ts` — `getTranscriptHistory(accountId)`, `getTranscriptByHash(accountId, hash)`, `getActiveJob(accountId)`

### 4.5 — Trigger.dev workflow tasks
Create `trigger/` directory structure:
```
trigger/
├── index.ts
├── tasks/
│   ├── prepare-transcript.ts
│   ├── extract-participants.ts
│   ├── extract-tasks.ts
│   ├── generate-summary.ts
│   ├── detect-signals.ts
│   └── finalize-transcript.ts
└── workflows/
    └── process-transcript.ts
```

**`trigger/tasks/prepare-transcript.ts`**
- Input: `{ transcriptId, content, accountId }`
- Update `transcripts.status = 'processing'`
- Normalize text, calculate word_count
- Update `transcripts.word_count`
- `metadata.root.set("progress", 10)`, `metadata.root.set("currentStep", "Procesando texto...")`
- Output: `{ cleanedContent, wordCount }`
- Retry: maxAttempts 1 (no external calls)

**`trigger/tasks/extract-participants.ts`**
- Input: `{ transcriptId, accountId, workspaceId, cleanedContent }`
- Anthropic Claude call: detect participants (name, email optional, confidence) — Zod validated output
- Query existing confirmed participants for this account (pre-confirmation logic)
- Insert into `participants` (if new) + `transcript_participants` (status: 'suggested', isKnownContact flag)
- `metadata.root.set("progress", 25)`, step: "Identificando participantes..."
- Retry: maxAttempts 2, exponential backoff (LLM call)

**`trigger/tasks/extract-tasks.ts`** (runs parallel with generate-summary)
- Input: `{ transcriptId, accountId, workspaceId, cleanedContent }`
- Anthropic Claude call: extract tasks with description, priority (1-5), source context — Zod validated
- Insert into `tasks` (source: 'ai_extracted', transcript_id, account_id)
- `metadata.root.set("progress", 50)`, step: "Extrayendo tareas..."
- Retry: maxAttempts 2, exponential backoff
- On non-retryable error (malformed response after retries): `throw new AbortTaskRunError("Task extraction failed")`

**`trigger/tasks/generate-summary.ts`** (runs parallel with extract-tasks)
- Input: `{ transcriptId, accountId, workspaceId, cleanedContent, recentSummaries[] }`
- Query last 3 `meeting_summary` values from account's transcripts for context
- Anthropic Claude call: generate meeting summary + updated account situation — Zod validated
- Update `transcripts.meeting_summary`
- `metadata.root.set("progress", 65)`, step: "Generando resumen..."
- Retry: maxAttempts 2, exponential backoff

**`trigger/tasks/detect-signals.ts`**
- Input: `{ transcriptId, accountId, workspaceId, summaryText, recentSummaries[], trigger: 'transcript_processing', adMetricsSnapshot: null }` (adMetricsSnapshot extension point — null in Phase 1, populated in Phase 11)
- Anthropic Claude call: detect signals (type, description, confidence, health_signal recommendation) — Zod validated
- For each detected signal: upsert via ON CONFLICT on partial unique index (signals_one_active_per_type)
  - Conflict = UPDATE description + created_at (replace active signal of same type)
  - No conflict = INSERT new active signal
- Update `accounts.health_signal` + `accounts.health_justification`
- Insert into `account_health_history`
- `metadata.root.set("progress", 85)`, step: "Detectando señales..."
- Retry: maxAttempts 2, exponential backoff

**`trigger/tasks/finalize-transcript.ts`**
- Input: `{ transcriptId, accountId, workspaceId }`
- Update `transcripts.status = 'completed'`, `transcripts.completed_at = now()`
- Update `accounts.last_activity_at = now()`, `accounts.ai_summary` (from latest meeting summary)
- Increment `usage_tracking.transcripts_count` + `words_processed` for current month
- `metadata.root.set("progress", 100)`, step: "¡Listo!"
- Retry: maxAttempts 3 (DB writes only — safe to retry)

**`trigger/workflows/process-transcript.ts`** — root orchestrator task
```typescript
// Execution order:
// 1. prepare-transcript (sequential)
// 2. extract-participants (sequential, needs prepared content)
// 3. extract-tasks + generate-summary (Promise.all — parallel)
// 4. detect-signals (sequential, needs summary)
// 5. finalize-transcript (sequential, cleanup)
```

### 4.6 — Real-time progress UI
- Install `@trigger.dev/react-hooks` (if separate from SDK)
- Create `components/transcript-progress.tsx` (client component):
  - `useRealtimeRun(triggerJobId, { accessToken })` hook
  - Progress bar: `run?.metadata?.progress ?? transcript.progressPercentage`
  - Current step text: `run?.metadata?.currentStep`
  - Stage indicators: 5 steps with active/completed/pending states
  - On `run.status === 'COMPLETED'`: trigger parent refresh (router.refresh() or revalidatePath)
  - On `run.status === 'FAILED'`: show error message + "Reintentar" button
- Create `app/api/trigger-token/route.ts` — generates short-lived Trigger.dev public access token for client

### 4.7 — Upload UI on Account Detail
- Add to `app/(protected)/app/accounts/[accountId]/page.tsx`:
  - Drag-and-drop textarea (paste) + file input (.txt/.docx)
  - Word count live counter
  - Quota display: "X transcripciones restantes este mes" (from usage_tracking)
  - Duplicate warning modal: "Esta transcripción parece haber sido procesada el [fecha]. ¿Querés procesarla igual?"
  - Submit → `uploadTranscript()` → on success, render `<TranscriptProgress triggerJobId={...} />`

### 4.8 — Transcript history section
- Add to account detail page:
  - List of `transcripts` ordered by created_at DESC, 10/page
  - Per entry: date, source badge (paste/file), status badge (procesado/error), word count
  - "Ver detalle" → `/app/accounts/[accountId]/transcripts/[transcriptId]`
  - "Reintentar" button for status='failed' → `retryTranscript()`
  - "Eliminar" → `deleteTranscript()` with confirmation

**Key new files:** `trigger/` directory (6 tasks + 1 workflow), `app/actions/transcripts.ts`, `lib/queries/transcripts.ts`, `components/transcript-progress.tsx`, `app/api/trigger-token/route.ts`

---

## Phase 5: Participants & Contact Directory

**What you can DO after this phase:** Review AI-suggested meeting participants, confirm/edit/delete them, see a contact directory per account with full vCard profiles, view meeting stats per person.

### 5.1 — Participants schemas
- Create `lib/drizzle/schema/participants.ts`:
  - Fields: id, account_id (FK CASCADE), workspace_id, name, email, role, phone, linkedin_url, source_type CHECK('ai_extracted'|'manual') DEFAULT 'ai_extracted', total_meetings DEFAULT 0, last_meeting_at, created_at, updated_at
  - Indexes: account_id, workspace_id
- Create `lib/drizzle/schema/transcript_participants.ts`:
  - Fields: id, transcript_id (FK CASCADE), participant_id (FK CASCADE), status CHECK('suggested'|'confirmed') DEFAULT 'suggested', is_known_contact (bool), created_at
  - UNIQUE(transcript_id, participant_id)
  - Indexes: transcript_id, participant_id
- Run migrations with down files; update schema index

### 5.2 — Lib queries
- Create `lib/queries/participants.ts`:
  - `getParticipantsByAccount(accountId)` — full list with meeting stats
  - `getSuggestedByTranscript(transcriptId)` — for post-processing confirmation UI
  - `getPreviouslyConfirmed(accountId)` — for pre-selection in future transcripts
  - `getByAccountGrouped(accountId)` — grouped by source (client vs internal)

### 5.3 — Server actions
- Create `app/actions/participants.ts`:
  - `confirmParticipant({ transcriptParticipantId })` — updates status to 'confirmed', increments total_meetings, updates last_meeting_at
  - `editParticipant({ participantId, name, role, email, phone, linkedinUrl })` — updates participant record
  - `deleteParticipantFromTranscript(transcriptParticipantId)` — removes suggestion
  - `addManualParticipant({ accountId, name, role, email, phone, linkedinUrl })` — source: 'manual'
  - `addManualContact({ accountId, name, role, email, phone, linkedinUrl })` — same as above, for contact directory

### 5.4 — Participant confirmation UI (post-processing)
- Add to account detail page — visible only when latest transcript has status='completed':
  - "Participantes sugeridos en esta reunión" section
  - Chip per suggested participant: name + confidence badge
  - Known contacts: pre-selected (green chip)
  - New: unconfirmed (gray chip)
  - Actions per chip: ✓ confirm, ✏️ edit name/role, ✗ remove false positive
  - "Agregar participante" → inline form

### 5.5 — Contact directory (vCard) section
- Add "Contactos del Cliente" section to account detail:
  - Card grid per confirmed participant
  - vCard fields: name, role/cargo, email (mailto link), phone (tel link), LinkedIn (external link)
  - Source badge: AI extraído / Manual
  - Edit → modal with full vCard form
  - Delete → confirmation
  - "Agregar contacto" button → modal

### 5.6 — Personas y Reuniones section
- Add to account detail page:
  - Tabs: [Todos] [Contactos del cliente] [Equipo interno]
  - Per person row: avatar initial, name, role, # reuniones, fecha última reunión
  - Sort by: # meetings (default), last meeting, name

**Key files:** `lib/drizzle/schema/participants.ts`, `transcript_participants.ts`, `app/actions/participants.ts`, `lib/queries/participants.ts`

---

## Phase 6: Task Management

**What you can DO after this phase:** View all AI-extracted tasks per account, mark them complete, edit descriptions, delete, and add tasks manually.

### 6.1 — Lib queries
- Create `lib/queries/tasks.ts`:
  - `getTasksByAccount(accountId, filter?)` — supports filter: 'pending'|'completed'|'all'
  - `getTasksByTranscript(transcriptId)` — for transcript detail page
  - `getOpenTasksCount(accountId)` — for portfolio card

### 6.2 — Server actions
- Create `app/actions/tasks.ts`:
  - `createTask({ accountId, description, priority? })` — source: 'manual', created_by: userId
  - `completeTask(taskId)` — sets status='completed', completed_at=now()
  - `reopenTask(taskId)` — sets status='pending', clears completed_at
  - `editTask({ taskId, description, priority? })`
  - `deleteTask(taskId)`

### 6.3 — Tasks section on Account Detail
- Add "Tareas y Próximos Pasos" section:
  - Filter tabs: [Pendientes] [Completadas]
  - Per task: checkbox, description, priority badge, source (transcript name or "Manual"), date
  - Inline complete toggle
  - Edit (inline or modal), Delete with confirmation
  - "Agregar tarea" → inline form at top of list
  - AI-extracted tasks show transcript badge with link to transcript detail
  - Empty state per filter: "No hay tareas pendientes — todo está al día ✓"

**Key files:** `app/actions/tasks.ts`, `lib/queries/tasks.ts`

---

## Phase 7: Signals & Manual Updates

**What you can DO after this phase:** View all detected health/risk/opportunity signals, resolve or edit them, see resolved history, add freetext account notes without a transcript.

### 7.1 — Lib queries
- Create `lib/queries/signals.ts`:
  - `getSignalsByAccount(accountId)` — returns active and resolved, grouped
  - `getActiveSignalsByType(accountId)` — for dedup check (used by detect-signals task)
  - `getSignalsCount(accountId)` — for portfolio card
- Create `lib/queries/manual-updates.ts`:
  - `getManualUpdatesByAccount(accountId)` — paginated, DESC
- Create `lib/queries/account-health-history.ts`:
  - `getHealthHistory(accountId)` — last N entries for sparkline

### 7.2 — Server actions
- Create `app/actions/signals.ts`:
  - `resolveSignal(signalId)` — sets status='resolved', resolved_at, resolved_by
  - `editSignal({ signalId, description })`
  - `deleteSignal(signalId)`
  - `createManualSignal({ accountId, type, description })` — source: 'manual'
- Create `app/actions/manual-updates.ts`:
  - `createManualUpdate({ accountId, content })` — no background job, direct insert
  - `deleteManualUpdate(manualUpdateId)`

### 7.3 — Signals section on Account Detail
- Add "Señales Detectadas" section:
  - Active risks (red badge section): description, date detected, source transcript link
  - Active opportunities (green badge section): same structure
  - Per signal: resolve (✓), edit (✏️), delete (✗) actions
  - "Señales resueltas" accordion (collapsed by default): list of resolved signals with resolution date
  - Empty state: "No hay señales activas — esta cuenta está bajo control"

### 7.4 — Manual Updates section on Account Detail
- Add "Actualizaciones Manuales" section (above Historial):
  - Textarea: "Agregar nota, decisión o contexto..."
  - Submit → `createManualUpdate()` → optimistic UI append
  - List of previous manual notes with date + delete action

### 7.5 — Account History section on Account Detail
- Unified "Historial" section at bottom:
  - Combined timeline: transcripts + manual updates, ordered by date DESC
  - 10/page with "Ver más" pagination
  - Transcript entry: date, "Transcripción", participant count, status badge, "Ver detalle" link
  - Manual update entry: date, "Nota manual", excerpt

**Key files:** `app/actions/signals.ts`, `app/actions/manual-updates.ts`, `lib/queries/signals.ts`

---

## Phase 8: Transcript Detail Page

**What you can DO after this phase:** Click "Ver detalle" on any past transcript and see exactly what AI extracted from that specific meeting — summary, tasks, participants, signals, and original text.

### 8.1 — Transcript detail queries
- Extend `lib/queries/transcripts.ts`:
  - `getTranscriptDetail(transcriptId, accountId)`:
    - transcript record
    - tasks WHERE transcript_id = transcriptId
    - transcript_participants with participant data
    - signals WHERE transcript_id = transcriptId
    - account name for breadcrumb

### 8.2 — Transcript detail page
- Create `app/(protected)/app/accounts/[accountId]/transcripts/[transcriptId]/page.tsx`:
  - Breadcrumb: "← Volver a [account name]"
  - Header: file name / "Transcripción pegada", date, status badge, word count
  - AI Summary block: `transcript.meeting_summary`
  - Participants section: confirmed + suggested from this transcript
  - Tasks extracted: list with complete/edit actions (reuse task components)
  - Signals detected: list with resolve actions (reuse signal components)
  - Original text: collapsible `<details>` block with monospace font
  - "Eliminar transcripción" button → confirmation → `deleteTranscript()` → redirect to account

**Key files:** `app/(protected)/app/accounts/[accountId]/transcripts/[transcriptId]/page.tsx`

---

## Phase 9: Profile, Billing & Usage

**What you can DO after this phase:** View and edit profile info, see current subscription tier (queried from Stripe API), manage billing via Stripe Customer Portal, view usage stats and limits, upgrade plan via Stripe Checkout.

### 9.1 — Stripe setup
- Install `stripe` npm package
- Create `lib/stripe.ts` — Stripe client with 3s timeout
- Configure env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Create Stripe products and prices for Free/Starter/Pro in Stripe dashboard
- Tag each price with `metadata.tier = 'free'|'starter'|'pro'`

### 9.2 — Subscription queries
- Create `lib/queries/subscriptions.ts`:
  - `getSubscriptionStatus(workspaceId)`:
    - Gets `workspaces.stripe_customer_id`
    - If no stripe_customer_id: return `{ tier: 'free', status: 'free' }`
    - `stripe.customers.retrieve(customerId, { expand: ['subscriptions'] })` with 3s timeout
    - On timeout: return `{ tier: 'free', status: 'unknown', fallback: true }` (conservative fallback)
    - Returns: `{ tier, renewalDate, status }`
  - `getTierLimits(tier)` — returns `{ transcriptsPerMonth, wordsPerTranscript, accountsLimit }`

### 9.3 — Subscription Server Actions
- Create `app/actions/subscription.ts`:
  - `createCheckoutSession({ priceId })`:
    - If no stripe_customer_id on workspace: create Stripe customer, save to `workspaces.stripe_customer_id`
    - Create Stripe Checkout session → return URL
    - Redirect outside try-catch
  - `createPortalLink()`:
    - Get workspace stripe_customer_id
    - Create Stripe Customer Portal session → return URL
    - Redirect outside try-catch

### 9.4 — Profile Server Actions
- Create `app/actions/profile.ts`:
  - `updateProfile({ fullName, avatarUrl? })`
  - `changePassword({ currentPassword, newPassword })` — via Supabase Auth
  - `deleteAccount()` — deletes workspace + cascade, then Supabase Auth user deletion

### 9.5 — Usage queries (extend)
- Extend `lib/queries/usage.ts`:
  - `getMonthlyUsage(workspaceId)` — current month from usage_tracking
  - `checkTranscriptQuota(workspaceId)` — returns `{ allowed, remaining, tier }`
  - `getUserStats(userId, workspaceId)` — aggregate stats for profile display
    - total transcripts, total AI tasks, total signals, most active account

### 9.6 — Profile page
- Update `middleware.ts` to protect `/app/profile`
- Create `app/(protected)/app/profile/page.tsx`:
  - **Account Info card**: avatar, name, email, "Cambiar contraseña" button, "Eliminar cuenta" button
  - **Billing card**: Query Stripe API → show tier name, renewal date; "Gestionar billing" → `createPortalLink()`; if fallback=true: show "Estado de suscripción no disponible temporalmente"
  - **Uso del mes card**: transcripts (progress bar X/Y), accounts count, words processed
  - **Estadísticas del usuario card**: total transcripts, total AI tasks, total signals detected/resolved, most active account
  - **Planes disponibles card**: 3 tier cards (Free/Starter/Pro); current plan highlighted; upgrade buttons → `createCheckoutSession()` with priceId

### 9.7 — Stripe webhook (minimal)
- Create `app/api/webhooks/stripe/route.ts`:
  - Verify Stripe signature with `STRIPE_WEBHOOK_SECRET`
  - Handle `invoice.payment_succeeded` — optional: send payment receipt email
  - No subscription state sync — Stripe is queried in real-time
  - Return 200 for all handled + unhandled events

### 9.8 — Quota enforcement in transcript upload (wire up)
- `app/actions/transcripts.ts` already calls `lib/queries/subscriptions.ts` — this was a placeholder in Phase 4
- In Phase 9, the real Stripe query is wired in: replace placeholder with `getSubscriptionStatus()` + `getTierLimits()` + `getMonthlyUsage()` comparison
- Update sidebar usage stats box with real `getMonthlyUsage()` data

**Key files:** `lib/stripe.ts`, `lib/queries/subscriptions.ts`, `app/actions/subscription.ts`, `app/actions/profile.ts`, `app/(protected)/app/profile/page.tsx`, `app/api/webhooks/stripe/route.ts`

---

## Phase 10: Admin Dashboard & User Management

**What you can DO after this phase (admin users):** See system-wide job metrics, monitor error rates, manage user accounts, suspend users, adjust quotas.

### 10.1 — Admin layout and route protection
- Create `app/(admin)/layout.tsx`:
  - Calls `requireAdminAccess()` (from `lib/auth.ts`)
  - Admin-specific sidebar: Dashboard, Usuarios
- Update `middleware.ts` to enforce role check on `/admin/*`
- Update `lib/auth.ts` — `requireAdminAccess()` should check workspace_members.role = 'admin' OR users.role (keep a global admin concept)

### 10.2 — Admin queries
- Create `lib/queries/admin.ts`:
  - `getSystemMetrics()`:
    - Total users count
    - Users by tier (from Stripe — or count workspaces with stripe_customer_id)
    - Jobs today/week/month (query transcripts by created_at)
    - Active jobs (status='processing')
    - Failed jobs + error rate (last 7 days)
    - Average processing time (completed_at - created_at for status='completed')
  - `getUsersList({ page, filter? })` — paginated; includes workspace plan, monthly usage
  - `getJobTimeSeries(days)` — daily job counts for chart (last 30 days)

### 10.3 — Admin Server Actions
- Create `app/actions/admin.ts`:
  - `suspendUser(userId)` — disables Supabase Auth user
  - `adjustQuota({ workspaceId, transcriptsLimit })` — creates/updates usage_tracking override

### 10.4 — Admin Dashboard page
- Create `app/(admin)/dashboard/page.tsx`:
  - Metric cards: total users, active jobs, failed jobs (with rate %), avg processing time
  - Jobs per day chart (last 30 days) — completed vs failed (use shadcn chart or recharts)
  - System health indicators: queue status, API status

### 10.5 — Admin Users page
- Create `app/(admin)/users/page.tsx`:
  - Table: email, workspace name, plan tier, transcripts this month, registration date, status
  - Filters: by tier, by status
  - Per row actions: "Ver detalle", "Suspender", "Ajustar cuota"
  - Pagination: 25/page

**Key files:** `app/(admin)/layout.tsx`, `app/(admin)/dashboard/page.tsx`, `app/(admin)/users/page.tsx`, `lib/queries/admin.ts`, `app/actions/admin.ts`

---

## Phase 11: Paid Media Integration (Ad Metrics)

**What you can DO after this phase:** Connect Google Ads, Meta Ads, and LinkedIn Ads accounts per client, sync metrics hourly, view Paid Media results section on account detail, drill into Campaign Detail page with per-channel breakdown.

> **Environment prerequisites:** `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

### 11.1 — Ad Metrics schemas
- Create `lib/drizzle/schema/ad_connections.ts`:
  - Fields: id, account_id (FK CASCADE), workspace_id, platform CHECK('google_ads'|'meta'|'linkedin'), ad_account_id, access_token (encrypted), refresh_token (encrypted), token_expires_at, status CHECK('active'|'needs_reauth'|'disconnected') DEFAULT 'active', has_active_campaigns (bool DEFAULT false), last_sync_at, created_at, updated_at
  - UNIQUE(account_id, platform)
- Create `lib/drizzle/schema/ad_metrics.ts`:
  - Fields: id, account_id (FK CASCADE), workspace_id, platform, campaign_id, campaign_name, status CHECK('active'|'paused'|'ended'), date (date), spend, impressions, clicks, leads, conversions, cpl, roas, ctr, cpc, cpm, created_at, updated_at
  - UNIQUE(account_id, platform, campaign_id, date)
  - Indexes: (account_id, platform, date), (account_id, date)
- Create `lib/drizzle/schema/ad_metrics_snapshots.ts`:
  - Fields: id, account_id (FK CASCADE), workspace_id, snapshot_data (JSONB), previous_data (JSONB), total_spend, total_leads, avg_cpl, avg_roas, period_days, synced_at, created_at
  - UNIQUE(account_id)
- Create `lib/drizzle/schema/ad_sync_jobs.ts`:
  - Fields: id, workspace_id (FK CASCADE), status CHECK('pending'|'running'|'completed'|'partial_failure'|'failed'), accounts_total, accounts_synced, accounts_failed, error_details (JSONB), started_at, completed_at, created_at
- Run all migrations with down files; update schema index
- Update `accounts.has_ad_connections` to be populated on connection create/delete

### 11.2 — OAuth connection flows
**Platform build order within Phase 11: Meta Ads first → Google Ads second → LinkedIn last**

- Create `app/api/oauth/meta/route.ts` — OAuth2 callback handler; stores tokens in ad_connections encrypted
- Create `app/api/oauth/google-ads/route.ts` — same pattern
- Create `app/api/oauth/linkedin/route.ts` — same pattern
- Create `app/actions/ad-connections.ts`:
  - `initiateOAuthFlow(platform, accountId)` — generates OAuth URL with state param
  - `disconnectAdPlatform({ accountId, platform })` — sets status='disconnected'
  - `triggerManualSync(accountId)` — Server Action → triggers sync-ad-metrics task for one account
  - Update `accounts.has_ad_connections` after connect/disconnect

### 11.3 — Trigger.dev Workflow 2: Ad Metrics Sync
Create task files following the spec in `ai_docs/prep/trigger_workflow_ad_metrics_sync.md`:

**`trigger/tasks/prepare-sync.ts`**
- Input: `{ workspaceId, accountId? }` (accountId = manual single-account sync; null = cron workspace-wide)
- Query ad_connections WHERE workspace_id = ? AND status = 'active' AND has_active_campaigns = true
- Build AccountConnectionManifest[]
- Create ad_sync_jobs record (status: 'running')
- Output: manifest + sync job ID

**`trigger/tasks/fetch-ad-metrics.ts`**
- Input: `{ manifest, adSyncJobId }`
- `Promise.all()` across all account×platform pairs
- Per pair: call platform API with date range (last 30 days), normalize response
- Error isolation: if one pair fails, continue others (log to adSyncJobId.error_details)
- Update `ad_connections.status = 'needs_reauth'` if token refresh fails
- Output: normalized metrics per account×platform

**`trigger/tasks/normalize-and-save.ts`**
- Input: `{ metricsData[], adSyncJobId }`
- Upsert into `ad_metrics` using UNIQUE(account_id, platform, campaign_id, date)
- Rebuild `ad_metrics_snapshots` per account: aggregate last 30d, store previous_data for LLM delta
- Update `ad_sync_jobs.accounts_synced`, `accounts_failed`
- Update `ad_connections.last_sync_at`

**`trigger/tasks/trigger-signal-refresh.ts`**
- Input: `{ accountIds[], adSyncJobId }`
- For each account with updated snapshot:
  - `tasks.trigger('detect-signals', { trigger: 'ad_metrics_sync', adMetricsSnapshot: snapshot, summaryText: null, recentSummaries })` — fire-and-forget
- Update `ad_sync_jobs.status = 'completed'`

**`trigger/workflows/sync-ad-metrics.ts`**
- Hourly cron: `0 * * * *` — triggers for each workspace with active ad_connections
- Manual trigger: from Campaign Detail page "Sincronizar" button
- Wire `adMetricsSnapshot` extension point in `detect-signals` task: replace `null` check with actual snapshot data when trigger source is 'ad_metrics_sync'

### 11.4 — Ad Metrics queries
- Create `lib/queries/ad-metrics.ts`:
  - `getMetricsByAccount(accountId, dateRange)` — aggregated metrics across all channels
  - `getMetricsByChannel(accountId, platform, dateRange)` — per-channel totals
  - `getCampaignList(accountId, platform, dateRange)` — individual campaign rows
  - `getAdConnections(accountId)` — connection status per platform
  - `getAdSnapshot(accountId)` — latest snapshot for quick metrics display

### 11.5 — Paid Media section on Account Detail
- Add "Resultados Paid Media y CRM" section to `app/(protected)/app/accounts/[accountId]/page.tsx`:
  - Visible only if `account.has_ad_connections = true`
  - Empty state if false: "Conectá tus cuentas publicitarias para ver métricas aquí" + "Conectar" button
  - Date selector: 7d / 30d / 90d / custom
  - Summary metrics cards: Leads, SQL, Inversión total, CPL, ROAS
  - Per-channel table: platform badge, spend, leads, CPL, ROAS, CTR
  - "Ver campañas en detalle →" link
- Add ad platform connection management to account detail:
  - Per platform row: connect / disconnect buttons
  - Status badge: Conectado / Necesita reautorización (orange) / Desconectado
  - `needs_reauth` shows warning badge on account header

### 11.6 — Campaign Detail page
- Create `app/(protected)/app/accounts/[accountId]/campaigns/page.tsx`:
  - `params: Promise<{ accountId: string }>` (Next.js 15 async params)
  - Header: account name + date range selector + "Sincronizar" button → `triggerManualSync(accountId)`
  - Consolidated summary row: total spend, leads, SQL, CPL, Lead→SQL%, ROAS, active creatives
  - Platform tabs: [Google Ads] [Meta Ads] [LinkedIn Ads]
  - Per tab: campaign list table with columns: name, status badge, spend, leads, CPL, ROAS, CTR, conversions
  - Configurable columns: checkbox panel saved per user via Server Action
  - Empty tab state: "Conectá tu cuenta de [platform] para ver campañas"
  - Back link: "← Volver a [account name]"

### 11.7 — Admin: Ad connections visibility
- Add "Conexiones publicitarias" section to Admin Dashboard:
  - Count of active connections, connections needing reauth
  - Link to filter users with needs_reauth connections

**Key new files:** `lib/drizzle/schema/ad_connections.ts` + ad_metrics + ad_metrics_snapshots + ad_sync_jobs, `trigger/tasks/prepare-sync.ts` + fetch-ad-metrics + normalize-and-save + trigger-signal-refresh, `trigger/workflows/sync-ad-metrics.ts`, `app/actions/ad-connections.ts`, `lib/queries/ad-metrics.ts`, `app/(protected)/app/accounts/[accountId]/campaigns/page.tsx`, `app/api/oauth/*.ts`

---

## Environment Variables Checklist

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Trigger.dev
TRIGGER_SECRET_KEY=
NEXT_PUBLIC_TRIGGER_PUBLIC_API_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Ad Platforms (Phase 11)
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
META_APP_ID=
META_APP_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

---

## File Structure (End State)

```
app/
├── (public)/
│   ├── page.tsx                          # Landing page
│   ├── privacy/page.tsx
│   ├── terms/page.tsx
│   └── layout.tsx
├── (auth)/
│   ├── login/page.tsx
│   ├── sign-up/page.tsx
│   ├── reset-password/page.tsx
│   ├── verify-email/page.tsx
│   └── layout.tsx
├── (protected)/
│   ├── layout.tsx                        # Sidebar + app shell
│   └── app/
│       ├── portfolio/page.tsx
│       ├── accounts/
│       │   ├── new/page.tsx
│       │   └── [accountId]/
│       │       ├── page.tsx              # Account detail (main page)
│       │       ├── transcripts/
│       │       │   └── [transcriptId]/page.tsx
│       │       └── campaigns/page.tsx    # Phase 11
│       └── profile/page.tsx
├── (admin)/
│   ├── layout.tsx
│   ├── dashboard/page.tsx
│   └── users/page.tsx
├── api/
│   ├── trigger/route.ts
│   ├── trigger-token/route.ts
│   ├── webhooks/stripe/route.ts
│   └── oauth/                            # Phase 11
│       ├── google-ads/route.ts
│       ├── meta/route.ts
│       └── linkedin/route.ts
└── actions/
    ├── auth.ts
    ├── accounts.ts
    ├── transcripts.ts
    ├── participants.ts
    ├── tasks.ts
    ├── signals.ts
    ├── manual-updates.ts
    ├── subscription.ts
    ├── profile.ts
    ├── admin.ts
    └── ad-connections.ts                 # Phase 11

trigger/
├── index.ts
├── tasks/
│   ├── prepare-transcript.ts
│   ├── extract-participants.ts
│   ├── extract-tasks.ts
│   ├── generate-summary.ts
│   ├── detect-signals.ts
│   ├── finalize-transcript.ts
│   ├── prepare-sync.ts                   # Phase 11
│   ├── fetch-ad-metrics.ts               # Phase 11
│   ├── normalize-and-save.ts             # Phase 11
│   └── trigger-signal-refresh.ts        # Phase 11
└── workflows/
    ├── process-transcript.ts
    └── sync-ad-metrics.ts                # Phase 11

lib/
├── auth.ts
├── stripe.ts
├── env.ts
├── utils.ts
├── workspace-context.tsx
├── drizzle/
│   ├── db.ts
│   └── schema/
│       ├── users.ts
│       ├── workspaces.ts
│       ├── workspace_members.ts
│       ├── accounts.ts
│       ├── transcripts.ts
│       ├── participants.ts
│       ├── transcript_participants.ts
│       ├── tasks.ts
│       ├── signals.ts
│       ├── account_health_history.ts
│       ├── manual_updates.ts
│       ├── usage_tracking.ts
│       ├── ad_connections.ts             # Phase 11
│       ├── ad_metrics.ts                 # Phase 11
│       ├── ad_metrics_snapshots.ts       # Phase 11
│       ├── ad_sync_jobs.ts               # Phase 11
│       └── index.ts
├── queries/
│   ├── workspace.ts
│   ├── accounts.ts
│   ├── transcripts.ts
│   ├── participants.ts
│   ├── tasks.ts
│   ├── signals.ts
│   ├── manual-updates.ts
│   ├── usage.ts
│   ├── subscriptions.ts
│   ├── admin.ts
│   └── ad-metrics.ts                     # Phase 11
└── supabase/
    ├── client.ts
    └── server.ts

components/
├── ui/                                   # shadcn components
├── sidebar.tsx
├── mobile-nav.tsx
├── app-header.tsx
├── account-card.tsx
└── transcript-progress.tsx
```

---

## Phase 4 Quota Enforcement Note

Phase 4 (transcript upload Server Action) calls `lib/queries/subscriptions.ts` for quota checking. In Phase 4, implement this as a permissive placeholder (always returns Pro limits) so the AI pipeline can be tested end-to-end. Wire real Stripe API calls in Phase 9 when Stripe is fully configured.

---

## Phase 11 `detect-signals` Extension Point

The `detect-signals` task built in Phase 4 already accepts `adMetricsSnapshot` in its input — set to `null` in Phase 1. In Phase 11, `trigger-signal-refresh` passes the real snapshot from `ad_metrics_snapshots`. No changes to `detect-signals` logic are needed — it already has conditional handling: if `adMetricsSnapshot !== null`, include metric delta context in the LLM prompt.
