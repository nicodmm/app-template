# Strategic Database Planning Document

**App:** plani.fyi
**Generated:** 2026-04-16
**Template Used:** worker-saas
**Core Workflows:** Transcript Processing (Phase 1), Ad Metrics Sync (Phase 2)

---

## Current Database State

### Existing Tables (Template — Baseline)

- `users` — User profiles synced with Supabase Auth. Contains `id`, `email`, `full_name`, `role`, timestamps.

### Template Assessment

- **Match Level: 10%** — The template provides only a bare `users` table. plani.fyi requires a full multi-tenant workspace model, two background job workflows, and multiple domain entities (accounts, transcripts, tasks, signals, participants).
- **Issues:** No workspace/tenancy model, no job tracking, no Stripe integration, no domain tables.
- **Ready to Build:** Auth flow only. Everything else needs to be created.

---

## Key Architecture Decisions

### Decision #1: Multi-Tenant Workspace Model

plani.fyi uses workspace-based subscriptions. Multiple users (account managers, team leads, admins) belong to a single workspace. Billing is per workspace, not per user.

- `stripe_customer_id` lives on `workspaces`, NOT on `users`
- The existing `users.role` field is removed — role context is per workspace via `workspace_members.role`
- All domain entities (`accounts`, `transcripts`, `tasks`, `signals`) carry a `workspace_id` for isolation

### Decision #2: Single `transcripts` Table (Job Tracking + Content + Results)

The transcript is both the input trigger and the result entity. A separate `transcript_jobs` table would add unnecessary joins for every query. The `transcripts` table carries:
- Job lifecycle fields: `status`, `progress_percentage`, `trigger_job_id`, `error_message`
- Input fields: `content`, `content_hash`, `file_name`, `word_count`
- Output fields: `meeting_summary` (AI-generated per-meeting summary)

This matches the blueprint's canonical pattern where transcripts are the primary history entity.

### Decision #3: `participants` Extended with vCard Fields from Day 1

The wireframe shows a full contact directory per account with name, role, email, phone, LinkedIn. Extending `participants` now avoids a migration later. Fields are all nullable — existing AI extraction flow is unaffected.

### Decision #4: `manual_updates` as Separate Table

Manual notes have no job lifecycle, no hash, no Trigger.dev integration. They are stored directly as timestamped text entries referencing an `account_id`. No background job required.

---

## Workflow-to-Schema Mapping

### Workflow 1: Transcript Processing (`trigger_workflow_transcript_processing.md`)

**Trigger:** User uploads/pastes transcript on Account Detail page

**Job Tracking Table:** `transcripts`
- `trigger_job_id` — Trigger.dev run ID for `useRealtimeRun()`
- `status` — `pending | processing | completed | failed | cancelled`
- `progress_percentage` — 0-100, synced with `metadata.root.set("progress", X)`
- `error_message` — user-friendly failure message (nullable)
- `content_hash` — SHA-256 of normalized content for duplicate detection

**Results Storage:** Embedded in `transcripts` table
- `meeting_summary` — AI-generated per-meeting situation summary

**Enhancement Tables:**
- `participants` + `transcript_participants` — AI-extracted participants confirmed by user
- `tasks` — AI-extracted tasks referencing source `transcript_id`
- `signals` — health/risk/opportunity signals with dedup by type per account
- `account_health_history` — audit trail of health signal changes

**Current State:** Needs full creation — none of these tables exist yet.

---

### Workflow 2: Ad Metrics Sync (`trigger_workflow_ad_metrics_sync.md`)

**Trigger:** Hourly cron per workspace + manual trigger from Account Detail

**Job Tracking Table:** `ad_sync_jobs`
- `trigger_job_id` — not applicable (cron-driven, workspace-level)
- `status` — `pending | running | completed | partial_failure | failed`
- `accounts_total`, `accounts_synced`, `accounts_failed` — batch progress
- `error_details` — JSONB per-account error log

**Results Storage:**
- `ad_metrics` — historical daily rows per campaign/channel (permanent, never deleted)
- `ad_metrics_snapshots` — aggregated per-account snapshot, upserted on each sync

**Supporting Tables:**
- `ad_connections` — per-account OAuth credentials per platform (Google Ads / Meta / LinkedIn)

**Current State:** Phase 2 — fully documented in `trigger_workflow_ad_metrics_sync.md`. No Phase 1 work needed.

---

## Complete Schema — Phase 1

### Users & Workspace

```typescript
// lib/drizzle/schema/users.ts — MODIFY existing
users {
  id:           uuid PK default gen_random_uuid()
  email:        text NOT NULL UNIQUE
  full_name:    text
  avatar_url:   text              // ADD — for profile display
  // role removed — role is workspace-scoped, lives in workspace_members
  created_at:   timestamp NOT NULL default now()
  updated_at:   timestamp NOT NULL default now()
}

// lib/drizzle/schema/workspaces.ts — NEW
workspaces {
  id:                  uuid PK default gen_random_uuid()
  name:                text NOT NULL
  slug:                text NOT NULL UNIQUE          // URL-safe identifier
  stripe_customer_id:  text                          // ONLY Stripe field
  owner_id:            uuid FK users.id
  created_at:          timestamp NOT NULL default now()
  updated_at:          timestamp NOT NULL default now()
}

// lib/drizzle/schema/workspace_members.ts — NEW
workspace_members {
  id:           uuid PK default gen_random_uuid()
  workspace_id: uuid FK workspaces.id ON DELETE CASCADE
  user_id:      uuid FK users.id ON DELETE CASCADE
  role:         text NOT NULL CHECK ('owner' | 'admin' | 'member')
  created_at:   timestamp NOT NULL default now()
  UNIQUE(workspace_id, user_id)
}
```

---

### Accounts

```typescript
// lib/drizzle/schema/accounts.ts — NEW
accounts {
  id:                    uuid PK default gen_random_uuid()
  workspace_id:          uuid FK workspaces.id ON DELETE CASCADE
  name:                  text NOT NULL
  owner_id:              uuid FK users.id ON DELETE SET NULL   // assigned account manager
  goals:                 text                                   // account objectives (free text)
  service_scope:         text                                   // scope of service (free text)
  health_signal:         text CHECK ('green' | 'yellow' | 'red' | 'inactive')
  health_justification:  text                                   // brief AI-generated reason
  ai_summary:            text                                   // current AI situation summary
  ai_summary_updated_at: timestamp                              // when AI last updated summary
  last_activity_at:      timestamp                              // updated by finalize-transcript task
  has_ad_connections:    boolean NOT NULL DEFAULT false         // Phase 2 flag
  created_at:            timestamp NOT NULL default now()
  updated_at:            timestamp NOT NULL default now()
}

INDEX: accounts(workspace_id)
INDEX: accounts(owner_id)
INDEX: accounts(workspace_id, health_signal)
INDEX: accounts(workspace_id, last_activity_at DESC)
```

---

### Transcript Processing

```typescript
// lib/drizzle/schema/transcripts.ts — NEW
// Single table: job tracking + input content + AI results
transcripts {
  id:                  uuid PK default gen_random_uuid()
  account_id:          uuid FK accounts.id ON DELETE CASCADE
  workspace_id:        uuid FK workspaces.id ON DELETE CASCADE
  uploaded_by:         uuid FK users.id ON DELETE SET NULL

  // Input fields
  file_name:           text                    // original filename (nullable if pasted)
  source_type:         text NOT NULL CHECK ('paste' | 'file')
  content:             text NOT NULL           // raw transcript text
  content_hash:        text NOT NULL           // SHA-256 of normalized content (dedup key)
  word_count:          integer

  // Trigger.dev job tracking (REQUIRED)
  trigger_job_id:      text                    // Trigger.dev run ID for useRealtimeRun()
  status:              text NOT NULL DEFAULT 'pending'
                         CHECK ('pending' | 'processing' | 'completed' | 'failed' | 'cancelled')
  progress_percentage: integer NOT NULL DEFAULT 0   // 0-100, synced with metadata.root.set()
  error_message:       text                    // user-friendly error (nullable)

  // AI output (populated on completion)
  meeting_summary:     text                    // AI-generated per-meeting summary

  created_at:          timestamp NOT NULL default now()
  completed_at:        timestamp               // nullable until completed
  updated_at:          timestamp NOT NULL default now()
}

INDEX: transcripts(account_id)
INDEX: transcripts(workspace_id)
INDEX: transcripts(status) WHERE status IN ('pending', 'processing')
INDEX: transcripts(account_id, content_hash)          // for duplicate detection
INDEX: transcripts(account_id, created_at DESC)       // for history pagination
```

---

### Participants & Contacts

```typescript
// lib/drizzle/schema/participants.ts — NEW
// Extends beyond meeting extraction — full contact directory per account
participants {
  id:             uuid PK default gen_random_uuid()
  account_id:     uuid FK accounts.id ON DELETE CASCADE
  workspace_id:   uuid FK workspaces.id ON DELETE CASCADE

  // Core identity
  name:           text NOT NULL
  email:          text                    // optional
  role:           text                    // job title / role (vCard field)
  phone:          text                    // optional
  linkedin_url:   text                    // optional

  // Source tracking
  source_type:    text NOT NULL DEFAULT 'ai_extracted'
                    CHECK ('ai_extracted' | 'manual')

  // Meeting stats (updated on transcript_participant confirmation)
  total_meetings: integer NOT NULL DEFAULT 0
  last_meeting_at: timestamp

  created_at:     timestamp NOT NULL default now()
  updated_at:     timestamp NOT NULL default now()
}

INDEX: participants(account_id)
INDEX: participants(workspace_id)

// lib/drizzle/schema/transcript_participants.ts — NEW
transcript_participants {
  id:             uuid PK default gen_random_uuid()
  transcript_id:  uuid FK transcripts.id ON DELETE CASCADE
  participant_id: uuid FK participants.id ON DELETE CASCADE
  status:         text NOT NULL DEFAULT 'suggested'
                    CHECK ('suggested' | 'confirmed')
  created_at:     timestamp NOT NULL default now()
  UNIQUE(transcript_id, participant_id)
}

INDEX: transcript_participants(transcript_id)
INDEX: transcript_participants(participant_id)
```

---

### Tasks

```typescript
// lib/drizzle/schema/tasks.ts — NEW
tasks {
  id:            uuid PK default gen_random_uuid()
  account_id:    uuid FK accounts.id ON DELETE CASCADE
  workspace_id:  uuid FK workspaces.id ON DELETE CASCADE
  transcript_id: uuid FK transcripts.id ON DELETE SET NULL   // source transcript (nullable if manual)
  created_by:    uuid FK users.id ON DELETE SET NULL         // for manually created tasks

  description:   text NOT NULL
  status:        text NOT NULL DEFAULT 'pending'
                   CHECK ('pending' | 'completed')
  source:        text NOT NULL CHECK ('ai_extracted' | 'manual')
  priority:      integer                   // AI-assigned priority (nullable)

  completed_at:  timestamp                 // nullable until completed
  created_at:    timestamp NOT NULL default now()
  updated_at:    timestamp NOT NULL default now()
}

INDEX: tasks(account_id, status)
INDEX: tasks(workspace_id)
INDEX: tasks(transcript_id)
```

---

### Signals

```typescript
// lib/drizzle/schema/signals.ts — NEW
signals {
  id:            uuid PK default gen_random_uuid()
  account_id:    uuid FK accounts.id ON DELETE CASCADE
  workspace_id:  uuid FK workspaces.id ON DELETE CASCADE
  transcript_id: uuid FK transcripts.id ON DELETE SET NULL   // source (nullable if from ad metrics)
  trigger_source: text NOT NULL CHECK ('transcript_processing' | 'ad_metrics_sync' | 'manual')

  type:          text NOT NULL
                   CHECK ('churn_risk' | 'growth_opportunity' | 'upsell_opportunity'
                          | 'inactivity_flag' | 'custom')
  status:        text NOT NULL DEFAULT 'active'
                   CHECK ('active' | 'resolved')
  description:   text NOT NULL

  // Resolution tracking
  resolved_at:   timestamp
  resolved_by:   uuid FK users.id ON DELETE SET NULL

  created_at:    timestamp NOT NULL default now()
  updated_at:    timestamp NOT NULL default now()
}

// Business rule: only one active signal per type per account
// Enforced in application code (detect-signals task), not DB constraint
// New signal of same type replaces existing active one via upsert

INDEX: signals(account_id, type, status)       // for dedup check
INDEX: signals(account_id, status)
INDEX: signals(workspace_id)
```

---

### Account Health History

```typescript
// lib/drizzle/schema/account_health_history.ts — NEW
account_health_history {
  id:            uuid PK default gen_random_uuid()
  account_id:    uuid FK accounts.id ON DELETE CASCADE
  workspace_id:  uuid FK workspaces.id ON DELETE CASCADE
  transcript_id: uuid FK transcripts.id ON DELETE SET NULL   // source event (nullable)

  health_signal: text NOT NULL CHECK ('green' | 'yellow' | 'red' | 'inactive')
  justification: text                     // AI-generated or manual reason

  created_at:    timestamp NOT NULL default now()
}

INDEX: account_health_history(account_id, created_at DESC)
```

---

### Manual Updates

```typescript
// lib/drizzle/schema/manual_updates.ts — NEW
// Notes and decisions added without a transcript (no background job)
manual_updates {
  id:           uuid PK default gen_random_uuid()
  account_id:   uuid FK accounts.id ON DELETE CASCADE
  workspace_id: uuid FK workspaces.id ON DELETE CASCADE
  created_by:   uuid FK users.id ON DELETE SET NULL

  content:      text NOT NULL             // free text note or decision

  created_at:   timestamp NOT NULL default now()
}

INDEX: manual_updates(account_id, created_at DESC)
```

---

### Usage Tracking

```typescript
// lib/drizzle/schema/usage_tracking.ts — NEW
// Completely independent from Stripe — tracks product usage per workspace per month
usage_tracking {
  id:                  uuid PK default gen_random_uuid()
  workspace_id:        uuid FK workspaces.id ON DELETE CASCADE
  month:               date NOT NULL                   // first day of billing month

  // Transcript quota (primary enforcement gate)
  transcripts_count:   integer NOT NULL DEFAULT 0
  words_processed:     integer NOT NULL DEFAULT 0

  // Account quota
  accounts_count:      integer NOT NULL DEFAULT 0      // updated on account create/delete

  updated_at:          timestamp NOT NULL default now()
  UNIQUE(workspace_id, month)
}

// Tier-based limits (enforced in Server Actions, not in DB):
// Free:    5 transcripts/month, 10k words each, 2 accounts
// Starter: 30 transcripts/month, 30k words each, 10 accounts
// Pro:     unlimited transcripts, 100k words each, 30 accounts
// All limits queried from Stripe API to determine tier, enforced against usage_tracking values
```

---

## Complete Schema — Phase 2 (Ad Metrics)

*Fully documented in `ai_docs/prep/trigger_workflow_ad_metrics_sync.md`. Summary below.*

```typescript
ad_connections {
  // Per-account OAuth credentials per platform (Google Ads | Meta | LinkedIn)
  // status: 'active' | 'needs_reauth' | 'disconnected'
  // has_active_campaigns: boolean (updated on each sync)
}

ad_metrics {
  // Historical daily rows per campaign/channel — never deleted
  // UNIQUE(account_id, platform, campaign_id, date)
  // UI queries with date range filter (7d / 30d / 90d / custom)
}

ad_metrics_snapshots {
  // Aggregated per-account view, rebuilt on each sync
  // UNIQUE(account_id) — one active snapshot per account
  // previous_data JSONB — stored for LLM delta comparison in detect-signals
}

ad_sync_jobs {
  // Batch sync job tracking (one per cron run per workspace)
  // No trigger_job_id — cron-driven, workspace-level, not subscribed via useRealtimeRun()
}
```

---

## Trigger.dev Integration Requirements

### Required Fields in `transcripts` Table

```typescript
// These fields enable real-time progress tracking in the frontend
trigger_job_id:      text       // Set by Server Action after tasks.trigger() call
status:              text       // Updated by finalize-transcript task on completion
progress_percentage: integer   // Updated by each task via updateJobProgress()
error_message:       text       // Set on task failure, shown to user
```

### Frontend Pattern

```typescript
// Account Detail page — subscribes to transcript job updates
const { run } = useRealtimeRun(transcript.triggerJobId, { accessToken });
const progress = run?.metadata?.progress ?? transcript.progressPercentage;
const currentStep = run?.metadata?.currentStep ?? "";
```

### Task Update Pattern

```typescript
// Each task in the pipeline updates both DB and metadata
await db.update(transcripts)
  .set({ progressPercentage: 45, updatedAt: new Date() })
  .where(eq(transcripts.id, transcriptId));

metadata.root.set("progress", 45);
metadata.root.set("currentStep", "Extrayendo tareas...");
```

---

## Stripe Integration Pattern

```typescript
// workspaces table: ONLY Stripe field is stripe_customer_id
// Never store subscription_tier or subscription_status

// Subscription check pattern (in Server Actions):
const workspace = await db.query.workspaces.findFirst({
  where: eq(workspaces.id, workspaceId)
});
const customer = await stripe.customers.retrieve(workspace.stripeCustomerId, {
  expand: ['subscriptions']
});
const tier = customer.subscriptions.data[0]?.metadata?.tier ?? 'free';

// Usage enforcement pattern:
const usage = await db.query.usageTracking.findFirst({
  where: and(
    eq(usageTracking.workspaceId, workspaceId),
    eq(usageTracking.month, startOfMonth(new Date()))
  )
});
// Compare usage.transcriptsCount against tier limit from Stripe
```

---

## Schema Overview

### Phase 1 Tables (12)

**Users & Workspace (3)**
- `users` — modified (remove role, add avatar_url)
- `workspaces` — new (stripe_customer_id here, not on users)
- `workspace_members` — new

**Accounts (1)**
- `accounts` — new (core domain entity)

**Transcript Processing (5)**
- `transcripts` — new (job tracking + content + AI results combined)
- `participants` — new (with vCard fields: role, phone, linkedin_url)
- `transcript_participants` — new (join table)
- `tasks` — new
- `signals` — new

**Account Intelligence (2)**
- `account_health_history` — new
- `manual_updates` — new

**Usage (1)**
- `usage_tracking` — new

### Phase 2 Tables (4)

- `ad_connections` — new
- `ad_metrics` — new
- `ad_metrics_snapshots` — new
- `ad_sync_jobs` — new

**Total: 16 tables (12 Phase 1 + 4 Phase 2)**

---

## Migration Order (Phase 1)

Run migrations in this order to respect foreign key dependencies:

```
1. users (modify — remove role column, add avatar_url)
2. workspaces (new — no FK dependencies except users)
3. workspace_members (new — depends on users + workspaces)
4. accounts (new — depends on workspaces + users)
5. transcripts (new — depends on accounts + workspaces + users)
6. participants (new — depends on accounts + workspaces)
7. transcript_participants (new — depends on transcripts + participants)
8. tasks (new — depends on accounts + workspaces + transcripts + users)
9. signals (new — depends on accounts + workspaces + transcripts + users)
10. account_health_history (new — depends on accounts + workspaces + transcripts)
11. manual_updates (new — depends on accounts + workspaces + users)
12. usage_tracking (new — depends on workspaces)
```

**Critical:** Create down migrations for ALL of the above before running `npm run db:migrate`.

---

## Strategic Advantage

The worker-saas template provided a clean authentication foundation. Building on top of it:

- `users` table + Supabase Auth integration is ready — just needs `avatar_url` and removal of the generic `role` field
- Drizzle ORM + Supabase PostgreSQL connection already configured
- Server Actions pattern already established

**The main architectural work is:**
- Adding the workspace multi-tenancy layer
- Creating the 11 domain tables for the transcript processing workflow
- Ensuring `trigger_job_id`, `status`, and `progress_percentage` are correctly wired to `useRealtimeRun()` in the frontend

> **Development Approach:** Implement Phase 1 tables in migration order above. For each Trigger.dev workflow task, update `transcripts.progress_percentage` and `metadata.root.set("progress")` together. Enforce tier-based limits by querying Stripe API for tier, then comparing against `usage_tracking` values — never store tier in your own database.

**Critical Reminder:** `stripe_customer_id` lives on `workspaces`. Query Stripe API for subscription status. Track usage in `usage_tracking`. Never mirror Stripe subscription state in your database.
