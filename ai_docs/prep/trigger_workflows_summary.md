# Trigger.dev Workflows Summary

**App:** plani.fyi
**Generated:** 2026-04-16

---

## Workflow Inventory

| # | Workflow ID | File | Phase | Trigger | Duration |
|---|---|---|---|---|---|
| 1 | `process-transcript` | `trigger_workflow_transcript_processing.md` | MVP | Manual (user upload) | 20-45s |
| 2 | `sync-ad-metrics` | `trigger_workflow_ad_metrics_sync.md` | Phase 2 | Hourly cron + manual | 15-120s |

---

## Build Order

### Phase 1 — MVP

**Workflow 1: Transcript Processing** (`process-transcript`)

- Foundation workflow — no dependencies on Phase 2
- 5-task pipeline: `extract-participants` → `extract-tasks` + `generate-summary` (parallel) → `detect-signals` → `finalize-transcript`
- Real-time streaming via `useRealtimeRun()` + `metadata.root.set()`
- `detect-signals` accepts `adMetricsSnapshot: null` in MVP (Phase 2 extension point)

### Phase 2 — Post-MVP

**Workflow 2: Ad Metrics Sync** (`sync-ad-metrics`)

- Depends on: accounts and ad_connections data from Phase 1 setup
- 4-task pipeline: `prepare-sync` → `fetch-ad-metrics` → `normalize-and-save` → `trigger-signal-refresh`
- Activates the `adMetricsSnapshot` extension point in `detect-signals`
- Hourly cron per workspace, scoped to accounts with active campaigns

---

## Dependency Graph

```
Phase 1 — MVP:

[User submits transcript]
         |
         v
process-transcript (5 tasks)
  ├── extract-participants
  ├── extract-tasks
  ├── generate-summary
  ├── detect-signals  ←── adMetricsSnapshot: null (MVP)
  └── finalize-transcript


Phase 2 — Post-MVP:

[Hourly cron / manual]
         |
         v
sync-ad-metrics (4 tasks)
  ├── prepare-sync
  ├── fetch-ad-metrics
  ├── normalize-and-save
  └── trigger-signal-refresh
           |
           v (fire-and-forget)
      detect-signals  ←── adMetricsSnapshot: real data (Phase 2)
```

---

## Shared Infrastructure

### Tasks shared across workflows

- `detect-signals` — called by both workflows. Handles `trigger: 'transcript_processing'` and `trigger: 'ad_metrics_sync'`. When triggered by ad metrics sync, `summaryText` is null and the LLM works from `recentSummaries` + `adMetricsSnapshot`.

### Database tables

| Table | Owned by | Used by |
|---|---|---|
| `transcripts` | Workflow 1 | Workflow 1 |
| `transcript_jobs` | Workflow 1 | Workflow 1 |
| `extracted_tasks` | Workflow 1 | UI |
| `account_signals` | Workflow 1 | Workflow 1 + 2 |
| `account_health_history` | Workflow 1 | UI |
| `ad_connections` | Workflow 2 | Workflow 2 |
| `ad_metrics` | Workflow 2 | UI (date range) |
| `ad_metrics_snapshots` | Workflow 2 | Workflow 1 + 2 |
| `ad_sync_jobs` | Workflow 2 | Admin panel |

### Key patterns (both workflows)

- **Idempotent writes** — all upserts use dedup keys; retries are safe
- **Error isolation** — failures in one item do not abort the batch
- **AbortTaskRunError** — non-retryable errors halt only that task run
- **metadata.root.set()** — child tasks propagate progress to root task (Workflow 1)
- **Fire-and-forget** — `detect-signals` triggered without awaiting (Workflow 2)

---

## Environment Variables Required

```env
# Trigger.dev
TRIGGER_SECRET_KEY=

# Anthropic (both workflows use detect-signals)
ANTHROPIC_API_KEY=

# Ad Platforms (Phase 2)
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
META_APP_ID=
META_APP_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```
