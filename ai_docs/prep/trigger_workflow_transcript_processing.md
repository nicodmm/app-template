# Trigger.dev Workflow: Transcript Processing

**App:** plani.fyi
**Workflow ID:** `process-transcript`
**Priority:** HIGH — Core workflow, foundation of the entire product
**Phase:** MVP (Phase 1)

---

## Workflow Overview

- **Core flow:** User submits transcript text → AI pipeline extracts participants, tasks, meeting summary, and health signals → account intelligence state updated
- **Trigger:** User submits transcript (paste or file upload) on Account Detail page — manual trigger via Server Action
- **Expected duration:** 20-45 seconds (4 LLM calls, 2 run in parallel)
- **Real-time tracking:** Yes — Trigger.dev `useRealtimeRun()` with `metadata.root.set()` for live progress updates in UI
- **Key decision points:**
  - Duplicate detection by content hash before job creation (Server Action, not in task)
  - Parallel execution: extract-tasks and generate-summary run simultaneously
  - Signal deduplication: only one active signal per type per account
  - Health signal scoring: LLM-based (verde/amarillo/rojo) using tasks + summary context
- **Future extension point:** `detect-signals` accepts `adMetricsSnapshot` (null in MVP, populated in Phase 2 when Ad Metrics Sync is active)
- **Tech stack:** Trigger.dev v4, Anthropic Claude API, Supabase PostgreSQL, Drizzle ORM

---

## Task Chain Diagram

```
[USER SUBMITS TRANSCRIPT — Account Detail Page]
        |
[Server Action: validateAndCreateTranscriptJob()]
  • Normalize text (trim, collapse whitespace)
  • Calculate SHA-256 hash of normalized content
  • Check duplicate: query transcripts WHERE account_id + content_hash
    → If duplicate found: return warning to UI (do not create job)
    → User confirms "process anyway" or cancels
  • Validate quota: check usage_tracking for current month vs tier limit
    → Free: 5/month | Starter: 30/month | Pro: unlimited
  • Validate word count vs tier limit
    → Free: 10,000 words | Starter: 30,000 | Pro: 100,000
  • Insert transcript record (status: "pending")
  • Insert transcript_job record (status: "pending")
  • Call: tasks.trigger("process-transcript", payload)
  • Return: { jobId, runId } to frontend for useRealtimeRun() subscription
        |
        v
┌─────────────────────────────────────────────────────────────┐
│ ROOT TASK: process-transcript                               │
│ Orchestrates all subtasks, owns the runId for UI streaming  │
│ Progress: 0% → 100%                                         │
└──────────────────────────┬──────────────────────────────────┘
                           |
┌──────────────────────────v──────────────────────────────────┐
│ Task 1: prepare-transcript                                  │
│                                                             │
│ • Update transcript_jobs.status → "processing"             │
│ • Normalize text (strip artifacts, standardize whitespace)  │
│ • Extract basic metadata: word_count, estimated_duration    │
│ • Prepare cleaned_text for LLM calls                        │
│                                                             │
│ metadata.root.set("progress", 10)                           │
│ metadata.root.set("currentStep", "Procesando texto...")     │
│                                                             │
│ Progress: 0% → 10%                                          │
│ Retry: maxAttempts 1 (no external calls, no retry needed)   │
└──────────────────────────┬──────────────────────────────────┘
                           |
┌──────────────────────────v──────────────────────────────────┐
│ Task 2: extract-participants                                 │
│                                                             │
│ • LLM call (Claude): detect participant names from text     │
│   - Patterns: "Name:", email addresses, first-person refs   │
│   - Output: name, email (optional), confidence level        │
│ • Query existing confirmed participants for this account    │
│ • Cross-reference: mark known contacts as pre-confirmed     │
│ • Insert suggested participants into transcript_participants │
│   (status: "suggested") with isKnownContact flag            │
│                                                             │
│ metadata.root.set("progress", 25)                           │
│ metadata.root.set("currentStep",                            │
│   "Identificando participantes...")                         │
│                                                             │
│ Progress: 10% → 25%                                         │
│ Retry: maxAttempts 3, exponential backoff (1s → 2s → 4s)    │
└──────────────────────────┬──────────────────────────────────┘
                           |
           ┌───────────────┴────────────────┐
           | ⚡ PARALLEL — Promise.all()     |
           v                                v
┌─────────────────────┐     ┌───────────────────────────────┐
│ Task 3a:            │     │ Task 3b:                      │
│ extract-tasks       │     │ generate-summary              │
│                     │     │                               │
│ • LLM call: extract │     │ • Fetch context from DB:      │
│   tasks, next steps │     │   - Current account summary   │
│   owners, deadlines │     │   - Last 5 transcripts        │
│   from transcript   │     │     (meeting_summary only,    │
│   text              │     │     not full text)            │
│                     │     │ • LLM call: generate          │
│ • Insert tasks into │     │   - Meeting summary           │
│   account_tasks     │     │     (this specific meeting)   │
│   with:             │     │   - Updated account summary   │
│   - description     │     │     (incorporates new context │
│   - owner (if found)│     │     into existing state)      │
│   - deadline        │     │   - Key decisions list        │
│   - priority        │     │                               │
│   - transcript_id   │     │ • Update account_summaries    │
│   (origin)          │     │   with new content            │
│                     │     │                               │
│ metadata.root.set(  │     │ metadata.root.set(            │
│   "progress", 55)   │     │   "progress", 55)             │
│ metadata.root.set(  │     │ metadata.root.set(            │
│   "currentStep",    │     │   "currentStep",              │
│   "Extrayendo       │     │   "Generando resumen...")     │
│   tareas...")       │     │                               │
│                     │     │ Progress: 25% → 55%           │
│ Progress: 25% → 55% │     │ Retry: maxAttempts 3,         │
│ Retry: maxAttempts 3│     │ exponential backoff           │
│ exponential backoff │     │                               │
└──────────┬──────────┘     └──────────────┬────────────────┘
           └───────────────┬───────────────┘
                           | (both complete)
┌──────────────────────────v──────────────────────────────────┐
│ Task 4: detect-signals                                      │
│                                                             │
│ • Inputs from previous tasks:                               │
│   - extractedTasks (from Task 3a output)                    │
│   - updatedAccountSummary (from Task 3b output)             │
│   - adMetricsSnapshot: null (MVP) / AdMetricsData (Phase 2) │
│                                                             │
│ • Fetch existing active signals for this account            │
│ • LLM call: analyze all inputs to detect:                   │
│   - Health signal overall: "green" | "yellow" | "red"       │
│   - Health rationale (brief explanation)                    │
│   - Signals by type: churn_risk, growth_opportunity,        │
│     upsell_opportunity, custom                              │
│   - Severity per signal: high | medium | low                │
│                                                             │
│ • Signal deduplication logic:                               │
│   - For each detected signal type:                          │
│     → If active signal of same type exists: REPLACE it      │
│       (update description + detected_at, keep history)      │
│     → If no active signal of same type: INSERT new          │
│   - Result: max one active signal per type per account      │
│                                                             │
│ • Update accounts.health_signal with new value              │
│ • Update accounts.health_rationale                          │
│                                                             │
│ metadata.root.set("progress", 90)                           │
│ metadata.root.set("currentStep",                            │
│   "Detectando señales de riesgo...")                        │
│                                                             │
│ Progress: 55% → 90%                                         │
│ Retry: maxAttempts 3, exponential backoff (1s → 2s → 4s)    │
└──────────────────────────┬──────────────────────────────────┘
                           |
┌──────────────────────────v──────────────────────────────────┐
│ Task 5: finalize-account-update                             │
│                                                             │
│ • Update transcript_jobs.status → "completed"              │
│ • Update transcripts.status → "processed"                  │
│ • Update accounts.last_activity_at → now()                  │
│ • Increment usage_tracking.transcripts_count for this month │
│                                                             │
│ metadata.root.set("progress", 100)                          │
│ metadata.root.set("currentStep", "Listo")                   │
│ metadata.root.set("status", "completed")                    │
│                                                             │
│ Progress: 90% → 100%                                        │
│ Retry: maxAttempts 1 (DB writes only, idempotent by jobId)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Critical Decision Points

**1. Duplicate Detection (Server Action, pre-trigger)**
```typescript
// In: app/actions/transcripts.ts
const normalizedText = content.trim().replace(/\s+/g, " ").toLowerCase();
const contentHash = createHash("sha256").update(normalizedText).digest("hex");

const existing = await db.query.transcripts.findFirst({
  where: and(
    eq(transcripts.accountId, accountId),
    eq(transcripts.contentHash, contentHash)
  ),
});

if (existing) {
  return { duplicate: true, existingTranscriptId: existing.id, processedAt: existing.createdAt };
  // UI shows warning — user decides whether to proceed
}
```

**2. Parallel Execution (Root task)**
```typescript
// In root process-transcript task
import { tasks } from "@trigger.dev/sdk/v3";

const [tasksResult, summaryResult] = await Promise.all([
  extractTasks.triggerAndWait({ jobId, transcriptId, accountId, cleanedText }),
  generateSummary.triggerAndWait({ jobId, transcriptId, accountId, cleanedText }),
]);
```

**3. Signal Deduplication (Task 4)**
```typescript
// In: trigger/tasks/detect-signals.ts
for (const detectedSignal of llmSignals) {
  const existingActive = await db.query.accountSignals.findFirst({
    where: and(
      eq(accountSignals.accountId, accountId),
      eq(accountSignals.type, detectedSignal.type),
      eq(accountSignals.status, "active")
    ),
  });

  if (existingActive) {
    // Replace: update in place, preserving signal ID
    await db.update(accountSignals)
      .set({ description: detectedSignal.description, detectedAt: new Date(), severity: detectedSignal.severity })
      .where(eq(accountSignals.id, existingActive.id));
  } else {
    // Insert new signal
    await db.insert(accountSignals).values({ accountId, transcriptId, ...detectedSignal });
  }
}
```

**4. Non-Retryable Errors (all LLM tasks)**
```typescript
import { AbortTaskRunError } from "@trigger.dev/sdk/v3";

// Quota exceeded — do not retry
if (error.status === 429 && error.type === "quota_exceeded") {
  await updateJobStatus(jobId, "failed", "Cuota de procesamiento alcanzada");
  throw new AbortTaskRunError("Quota exceeded — non-retryable");
}

// Invalid content — do not retry
if (wordCount < 10) {
  throw new AbortTaskRunError("Transcript too short — non-retryable");
}
```

---

## Core Data Flow

### Task Payload Interfaces

```typescript
// Root task trigger payload
interface ProcessTranscriptPayload {
  jobId: string;           // transcript_jobs.id
  transcriptId: string;    // transcripts.id
  accountId: string;       // accounts.id
  userId: string;          // users.id
  userTier: "free" | "starter" | "pro";
  contentHash: string;     // SHA-256 of normalized text
}

// Task 1 output (passed to Task 2)
interface PreparedTranscriptData {
  jobId: string;
  transcriptId: string;
  accountId: string;
  cleanedText: string;
  wordCount: number;
}

// Task 2 output (passed to Task 3a + 3b in parallel)
interface ParticipantExtractionResult {
  jobId: string;
  transcriptId: string;
  accountId: string;
  cleanedText: string;     // forwarded for 3a + 3b
  suggestedParticipants: Array<{
    name: string;
    email?: string;
    confidence: "high" | "medium" | "low";
    isKnownContact: boolean;
  }>;
}

// Task 3a output
interface ExtractedTasksData {
  tasks: Array<{
    description: string;
    owner?: string;
    deadline?: string;
    priority: "high" | "medium" | "low";
  }>;
}

// Task 3b output
interface GeneratedSummaryData {
  meetingSummary: string;       // summary of this specific meeting
  updatedAccountSummary: string; // updated account situation state
  keyDecisions: string[];
}

// Task 4 input (merged results from 3a + 3b)
interface DetectSignalsPayload {
  jobId: string;
  transcriptId: string;
  accountId: string;
  extractedTasks: ExtractedTasksData;
  generatedSummary: GeneratedSummaryData;
  adMetricsSnapshot: null; // Phase 2: AdMetricsSnapshot type
}

// Task 4 output (passed to Task 5)
interface DetectedSignalsData {
  healthSignal: "green" | "yellow" | "red";
  healthRationale: string;
  signals: Array<{
    type: "churn_risk" | "growth_opportunity" | "upsell_opportunity" | "custom";
    description: string;
    severity: "high" | "medium" | "low";
  }>;
}
```

### Database Tables Involved

```typescript
// transcript_jobs — job tracking and progress
{
  id: uuid,
  transcript_id: uuid,
  account_id: uuid,
  user_id: uuid,
  trigger_run_id: string,   // Trigger.dev runId for useRealtimeRun()
  status: "pending" | "processing" | "completed" | "failed",
  error_message: text | null,
  created_at: timestamp,
  completed_at: timestamp | null,
}

// transcripts — transcript records
{
  id: uuid,
  account_id: uuid,
  user_id: uuid,
  content: text,             // original text
  content_hash: string,      // SHA-256 for dedup
  word_count: int,
  status: "pending" | "processed" | "failed",
  meeting_summary: text | null,   // generated by Task 3b
  created_at: timestamp,
}

// transcript_participants — suggested + confirmed participants
{
  id: uuid,
  transcript_id: uuid,
  account_id: uuid,
  participant_id: uuid | null,  // null if not yet linked to known contact
  suggested_name: string,
  email: string | null,
  confidence: "high" | "medium" | "low",
  is_known_contact: boolean,
  status: "suggested" | "confirmed" | "rejected",
  created_at: timestamp,
}

// participants — confirmed contacts per account
{
  id: uuid,
  account_id: uuid,
  name: string,
  email: string | null,
  role: string | null,
  created_at: timestamp,
}

// account_tasks — tasks extracted per transcript
{
  id: uuid,
  account_id: uuid,
  transcript_id: uuid | null,  // null if manually added
  description: text,
  owner: string | null,
  deadline: date | null,
  priority: "high" | "medium" | "low",
  status: "pending" | "completed",
  created_at: timestamp,
  completed_at: timestamp | null,
}

// account_signals — deduplicated active signals per account
{
  id: uuid,
  account_id: uuid,
  transcript_id: uuid | null,  // origin transcript
  type: "churn_risk" | "growth_opportunity" | "upsell_opportunity" | "custom",
  description: text,
  severity: "high" | "medium" | "low",
  status: "active" | "resolved",
  detected_at: timestamp,
  resolved_at: timestamp | null,
}

// account_summaries — latest situation summary per account
{
  id: uuid,
  account_id: uuid,
  transcript_id: uuid,         // most recent transcript that generated this
  summary: text,               // updated account situation state
  created_at: timestamp,
}

// accounts — updated by this workflow
{
  ...existing fields...,
  health_signal: "green" | "yellow" | "red",
  health_rationale: text | null,
  last_activity_at: timestamp,
}

// usage_tracking — quota enforcement
{
  id: uuid,
  user_id: uuid,
  month: string,               // "2026-04" format
  transcripts_count: int,
  words_processed: int,
}
```

---

## File Locations

```
trigger/
├── tasks/
│   ├── process-transcript.ts          # Root orchestrator task
│   ├── prepare-transcript.ts          # Task 1
│   ├── extract-participants.ts        # Task 2
│   ├── extract-tasks.ts               # Task 3a
│   ├── generate-summary.ts            # Task 3b
│   ├── detect-signals.ts              # Task 4
│   └── finalize-account-update.ts     # Task 5
└── utils/
    ├── transcript-processing.ts       # Text normalization, hash calculation
    ├── llm-client.ts                  # Anthropic Claude API wrapper
    ├── progress-helpers.ts            # updateJobProgress() helper
    └── signal-dedup.ts                # Signal deduplication logic

app/
└── actions/
    └── transcripts.ts                 # validateAndCreateTranscriptJob()

lib/
├── drizzle/
│   └── schema/
│       ├── transcripts.ts
│       ├── transcript-jobs.ts
│       ├── transcript-participants.ts
│       ├── participants.ts
│       ├── account-tasks.ts
│       ├── account-signals.ts
│       ├── account-summaries.ts
│       └── usage-tracking.ts
└── queries/
    ├── transcripts.ts                 # getTranscriptById, checkDuplicate
    ├── participants.ts                # getKnownParticipants, upsertParticipant
    ├── tasks.ts                       # insertExtractedTasks
    ├── signals.ts                     # upsertSignal, getActiveSignals
    ├── summaries.ts                   # getRecentSummaries (last 5), upsertSummary
    └── usage.ts                       # checkQuota, incrementUsage
```

---

## Key Utility Functions

- `normalizeTranscriptText(content: string): string` — trim, collapse whitespace, lowercase for hashing
- `calculateContentHash(normalizedText: string): string` — SHA-256 hex digest
- `checkTranscriptDuplicate(accountId, contentHash): Promise<Transcript | null>` — query by account + hash
- `checkQuota(userId, tier): Promise<{ allowed: boolean; remaining: number }>` — validate before job creation
- `updateJobProgress(jobId, progress, step): Promise<void>` — DB update + metadata.root.set()
- `getRecentTranscriptSummaries(accountId, limit = 5): Promise<string[]>` — last N meeting summaries for context
- `upsertAccountSignal(accountId, transcriptId, signal): Promise<void>` — dedup insert/update logic
- `buildLLMContext(accountSummary, recentSummaries): string` — assembles prompt context for generate-summary

---

## Progress Tracking Pattern

**Frontend subscription (Account Detail Page):**
```typescript
// After job creation, frontend receives runId from Server Action
const { run } = useRealtimeRun(runId);

// Reads metadata set by metadata.root.set() in child tasks
const progress = run?.metadata?.progress ?? 0;
const currentStep = run?.metadata?.currentStep ?? "Iniciando...";
const status = run?.metadata?.status; // "completed" when done
```

**Progress ranges:**
- 0%: Job created, not yet started
- 0-10%: prepare-transcript (Task 1)
- 10-25%: extract-participants (Task 2)
- 25-55%: extract-tasks + generate-summary (Tasks 3a + 3b, parallel)
- 55-90%: detect-signals (Task 4)
- 90-100%: finalize-account-update (Task 5)

**Child task metadata update pattern:**
```typescript
// Inside any child task (Tasks 1-5):
import { metadata } from "@trigger.dev/sdk/v3";

// Use metadata.root.set() — propagates to root task for UI
metadata.root.set("progress", 55);
metadata.root.set("currentStep", "Detectando señales de riesgo...");
```

---

## Common Failure Points

- **LLM API timeout (OpenAI/Anthropic):** Handled by per-task retry (maxAttempts 3, exponential backoff). After 3 failures, job status → "failed", user can retry from UI.
- **Quota exceeded (LLM API):** Non-retryable — `AbortTaskRunError`. User-facing message: "Límite de procesamiento alcanzado. Revisá tu plan."
- **Word count exceeds tier limit:** Non-retryable, validated in Server Action before triggering. User-facing: "La transcripción supera el límite de palabras de tu plan."
- **Duplicate transcript detected:** Not an error — Server Action returns warning, user confirms before proceeding.
- **Context fetch failure (getRecentSummaries):** Task 3b should use empty context and continue rather than fail — account has no historical context, which is valid for new accounts.
- **Parallel task partial failure (3a or 3b):** If one fails, `Promise.all()` rejects and the root task fails. Both tasks have independent retries before the error propagates.
- **Signal deduplication conflict:** Handled by SELECT-then-UPDATE pattern within a single task, not concurrent — no race condition risk since one transcript runs one job at a time per account.

---

## Architecture Principles

- **Root task owns the runId** — frontend subscribes only to the root `process-transcript` run. Child tasks update metadata via `metadata.root.set()` so updates propagate regardless of nesting depth.
- **Database as source of truth** — every task reads/writes to PostgreSQL. If a task is retried, it overwrites its own previous partial writes (idempotent by `jobId` / `transcriptId`).
- **Stateless tasks** — no shared memory between tasks. All context passed via typed payloads or fetched from DB.
- **Parallel where independent** — Tasks 3a and 3b both read `cleanedText` and write to separate tables. No dependency between them, safe to parallelize. Estimated time saving: ~15-20 seconds.
- **adMetricsSnapshot extension point** — Task 4 (`detect-signals`) accepts `adMetricsSnapshot: null` in MVP. In Phase 2, when Ad Metrics Sync workflow is active, the root task fetches the latest metrics snapshot before calling detect-signals and passes it as context to the LLM.
- **Inactivity via last_activity_at** — `finalize-account-update` always updates `accounts.last_activity_at`. No background batch job needed — portfolio dashboard queries this field directly to flag inactive accounts.
- **One active signal per type** — enforced in Task 4 with SELECT-then-UPDATE. Not a database constraint (to allow history) but a business rule enforced in application logic.

---

## Implementation Checklist

**Prerequisites:**
- [ ] `TRIGGER_SECRET_KEY` in `.env.local`
- [ ] `ANTHROPIC_API_KEY` in `.env.local`
- [ ] Trigger.dev v4 project created
- [ ] `@trigger.dev/sdk` and `@trigger.dev/react-hooks` installed

**Database migrations (create before implementing tasks):**
- [ ] `transcript_jobs` table with trigger_run_id column
- [ ] `transcripts` table with content_hash column
- [ ] `transcript_participants` table
- [ ] `participants` table
- [ ] `account_tasks` table
- [ ] `account_signals` table with type + status for dedup
- [ ] `account_summaries` table
- [ ] `usage_tracking` table
- [ ] Add `health_signal`, `health_rationale`, `last_activity_at` to `accounts`

**Implementation order:**
1. DB schema + migrations (all tables above)
2. Lib queries (transcripts, participants, tasks, signals, summaries, usage)
3. Server Action: `validateAndCreateTranscriptJob()`
4. Task 1: `prepare-transcript`
5. Task 2: `extract-participants`
6. Tasks 3a + 3b: `extract-tasks` + `generate-summary` (parallel)
7. Task 4: `detect-signals`
8. Task 5: `finalize-account-update`
9. Root task: `process-transcript` (orchestrates all above)
10. Frontend: `useRealtimeRun()` integration on Account Detail Page

**Testing strategy:**
- Short transcript (<100 words): validates edge case handling in extract-participants + extract-tasks
- Normal transcript (~500-1500 words): happy path test
- Duplicate transcript: verify warning flow and hash detection
- Quota exceeded: verify non-retryable error and user message
- LLM timeout simulation: verify retry + exponential backoff behavior
- Retry after failure: verify idempotency (no duplicate tasks/signals created)
