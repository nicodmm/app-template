# Trigger.dev Workflow: Ad Metrics Sync

**App:** plani.fyi
**Workflow ID:** `sync-ad-metrics`
**Priority:** HIGH — Phase 2 workflow, powers the adMetricsSnapshot extension point in Transcript Processing
**Phase:** Phase 2 (post-MVP)

---

## Workflow Overview

- **Core flow:** Hourly cron trigger per workspace → fetch active campaign metrics from each account's connected ad platforms (Google Ads, Meta, LinkedIn) in parallel → normalize and store historical daily rows → rebuild per-account snapshot → LLM re-evaluates signals for accounts with changed metrics
- **Trigger:** Hourly cron job per workspace (`sync-ad-metrics-[workspaceId]`), scoped to accounts with active campaigns. Also triggerable manually from Account Detail page.
- **Expected duration:** 15-120 seconds depending on number of connected accounts and platforms (parallel fetches)
- **Real-time tracking:** No UI streaming — progress tracked in `ad_sync_jobs` table, visible in Admin panel
- **Key decision points:**
  - Only accounts with `has_active_campaigns = true` are fetched on hourly runs (reduces API calls)
  - Fetch failures are isolated per account×platform pair — one platform failing does not abort others
  - OAuth token refresh attempted before fetch; if unrefreshable, connection marked `needs_reauth` and skipped
  - Signal refresh triggered (fire-and-forget) per account after snapshot is updated; LLM interprets the delta
  - All raw daily rows stored permanently — UI supports date range filtering
- **Connection model:** Per-account OAuth connections (each account has its own Google Ads / Meta / LinkedIn credentials)
- **Tech stack:** Trigger.dev v4, Google Ads API, Meta Marketing API, LinkedIn Campaign Manager API, Supabase PostgreSQL, Drizzle ORM

---

## Task Chain Diagram

```
[CRON TRIGGER: hourly per workspace]
  OR
[MANUAL TRIGGER: user clicks "Sync Now" on Account Detail]
        |
[Trigger.dev schedules: sync-ad-metrics]
  • Payload: { workspaceId, syncJobId, triggeredBy }
        |
        v
┌─────────────────────────────────────────────────────────────┐
│ Task 1: prepare-sync                                        │
│ • Query accounts with active ad_connections in workspace    │
│ • Filter: has_active_campaigns = true (skip if hourly cron) │
│   → Manual trigger: include all connected accounts          │
│ • Attempt OAuth token refresh per connection needing it     │
│   → Unrefreshable: set connection status = "needs_reauth"  │
│   → Skip that account×platform, continue                   │
│ • Build fetch manifest: [{accountId, platform, adAccountId, │
│     accessToken, refreshToken}]                             │
│ • Update ad_sync_jobs: status = "running", accounts_total   │
│ Progress: 0% → 10%                                          │
└─────────────────────┬───────────────────────────────────────┘
                      |
                      v
┌─────────────────────────────────────────────────────────────┐
│ Task 2: fetch-ad-metrics                                    │
│ • Promise.all() across all account×platform pairs           │
│   → Google Ads: fetch campaigns, daily spend, ROAS, clicks  │
│   → Meta Ads: fetch ad sets, impressions, CTR, conversions  │
│   → LinkedIn: fetch sponsored content, CPL, engagement rate │
│ • Date window: today's running totals (current date)        │
│ • Also detect: are campaigns currently active?              │
│   → Update has_active_campaigns per account after fetch     │
│ • Per-pair error isolation:                                 │
│   → API error: log to raw_results[pair].error, continue     │
│   → Rate limit: exponential backoff + retry (Trigger.dev)   │
│ • Collect: rawResults[] — success and failure pairs both    │
│ Progress: 10% → 60%                                         │
└─────────────────────┬───────────────────────────────────────┘
                      |
                      v
┌─────────────────────────────────────────────────────────────┐
│ Task 3: normalize-and-save                                  │
│ • For each successful rawResult:                            │
│   → Normalize to common schema per row:                     │
│      (account_id, platform, campaign_id, date, spend,       │
│       impressions, clicks, conversions, cpc, cpm, ctr, roas)│
│   → Upsert into ad_metrics (idempotent by unique key:       │
│      account_id + platform + campaign_id + date)            │
│ • Rebuild ad_metrics_snapshot per account:                  │
│   → Aggregate all platforms for account                     │
│   → Compute totals: spend, impressions, clicks, conversions │
│   → Compute averages: CPC, ROAS, CTR                        │
│   → Store previous snapshot in snapshot.previous_data       │
│   → Save new snapshot with computed_at = now()             │
│ • Update ad_sync_jobs: accounts_synced++, accounts_failed++ │
│ Progress: 60% → 88%                                         │
└─────────────────────┬───────────────────────────────────────┘
                      |
                      v
┌─────────────────────────────────────────────────────────────┐
│ Task 4: trigger-signal-refresh (fire-and-forget, per        │
│ account where snapshot was updated)                         │
│ • For each account with a refreshed snapshot:               │
│   → tasks.triggerAndForget("detect-signals", {              │
│        accountId,                                           │
│        jobId: null,  // not tied to a transcript job        │
│        adMetricsSnapshot: currentSnapshot,                  │
│        trigger: "ad_metrics_sync"                           │
│      })                                                     │
│ • Do NOT await — sync job completes independently           │
│ • Update ad_sync_jobs: status = "completed"                 │
│ Progress: 88% → 100%                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## TypeScript Payload Interfaces

```typescript
// Cron/manual trigger payload
interface SyncAdMetricsPayload {
  workspaceId: string;
  syncJobId: string;
  triggeredBy: 'cron' | 'manual';
  manualAccountId?: string; // if triggered from a single account
}

// Task 1 output / Task 2 input
interface FetchAdMetricsPayload {
  workspaceId: string;
  syncJobId: string;
  syncDate: string; // ISO date: "2026-04-16"
  fetchManifest: AdConnectionManifestItem[];
}

interface AdConnectionManifestItem {
  accountId: string;
  connectionId: string;
  platform: 'google_ads' | 'meta' | 'linkedin';
  adAccountId: string;  // platform-specific account ID
  accessToken: string;
  refreshToken: string;
}

// Task 2 output / Task 3 input
interface NormalizeAndSavePayload {
  workspaceId: string;
  syncJobId: string;
  syncDate: string;
  rawResults: AdFetchResult[];
}

interface AdFetchResult {
  accountId: string;
  connectionId: string;
  platform: 'google_ads' | 'meta' | 'linkedin';
  success: boolean;
  data?: RawAdPlatformResponse; // raw API response, platform-specific
  error?: string;
}

// Normalized metric row (common schema across platforms)
interface NormalizedAdMetricRow {
  accountId: string;
  workspaceId: string;
  platform: 'google_ads' | 'meta' | 'linkedin';
  campaignId: string;
  campaignName: string;
  date: string; // ISO date
  spend: number;          // USD
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;            // cost per click
  cpm: number;            // cost per 1000 impressions
  ctr: number;            // click-through rate (0.0 - 1.0)
  roas: number;           // return on ad spend
  rawData: Record<string, unknown>; // full API response preserved
}

// Per-account aggregated snapshot
interface AdMetricsSnapshot {
  accountId: string;
  workspaceId: string;
  periodStart: string; // ISO date
  periodEnd: string;   // ISO date (= syncDate)
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  avgCpc: number;
  avgRoas: number;
  avgCtr: number;
  activeCampaigns: number;
  platformBreakdown: {
    platform: string;
    spend: number;
    impressions: number;
    clicks: number;
    roas: number;
  }[];
  computedAt: string; // ISO datetime
  previousData: AdMetricsSnapshot | null; // snapshot before this update
}

// Task 3 output / Task 4 input
interface TriggerSignalRefreshPayload {
  workspaceId: string;
  syncJobId: string;
  accountsWithUpdates: {
    accountId: string;
    currentSnapshot: AdMetricsSnapshot;
  }[];
}

// detect-signals task (extended from Transcript Processing workflow)
// adMetricsSnapshot was null in MVP, now populated in Phase 2
interface DetectSignalsPayload {
  accountId: string;
  jobId: string | null;          // null when triggered by ad metrics sync
  summaryText: string | null;    // null when triggered by ad metrics sync
  recentSummaries: string[];
  adMetricsSnapshot: AdMetricsSnapshot | null;
  trigger: 'transcript_processing' | 'ad_metrics_sync';
}
```

---

## Database Schema

### New Tables (Phase 2)

```sql
-- OAuth connections per account per platform
CREATE TABLE ad_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('google_ads', 'meta', 'linkedin')),
  ad_account_id   TEXT NOT NULL,  -- platform-specific account ID
  access_token    TEXT NOT NULL,  -- encrypted at rest
  refresh_token   TEXT NOT NULL,  -- encrypted at rest
  token_expires_at TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'needs_reauth', 'disconnected')),
  has_active_campaigns BOOLEAN NOT NULL DEFAULT false,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, platform)
);

-- Historical daily metric rows per campaign (never deleted)
CREATE TABLE ad_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id   UUID NOT NULL REFERENCES ad_connections(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('google_ads', 'meta', 'linkedin')),
  campaign_id     TEXT NOT NULL,     -- platform-specific campaign ID
  campaign_name   TEXT NOT NULL,
  date            DATE NOT NULL,
  spend           NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions     INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  conversions     INTEGER NOT NULL DEFAULT 0,
  cpc             NUMERIC(10,4),
  cpm             NUMERIC(10,4),
  ctr             NUMERIC(8,6),      -- 0.0 to 1.0
  roas            NUMERIC(10,4),
  raw_data        JSONB,             -- full API response preserved
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, platform, campaign_id, date)
);

CREATE INDEX idx_ad_metrics_account_date ON ad_metrics(account_id, date DESC);
CREATE INDEX idx_ad_metrics_workspace_date ON ad_metrics(workspace_id, date DESC);

-- Aggregated snapshot per account (latest period, rebuilt on each sync)
CREATE TABLE ad_metrics_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  total_spend      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_impressions INTEGER NOT NULL DEFAULT 0,
  total_clicks     INTEGER NOT NULL DEFAULT 0,
  total_conversions INTEGER NOT NULL DEFAULT 0,
  avg_cpc          NUMERIC(10,4),
  avg_roas         NUMERIC(10,4),
  avg_ctr          NUMERIC(8,6),
  active_campaigns INTEGER NOT NULL DEFAULT 0,
  platform_breakdown JSONB,          -- per-platform aggregates
  previous_data    JSONB,            -- previous snapshot for LLM delta comparison
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id)                 -- one active snapshot per account, upserted
);

-- Sync job tracking (one record per cron run)
CREATE TABLE ad_sync_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed',
                                        'partial_failure', 'failed')),
  triggered_by      TEXT NOT NULL CHECK (triggered_by IN ('cron', 'manual')),
  accounts_total    INTEGER NOT NULL DEFAULT 0,
  accounts_synced   INTEGER NOT NULL DEFAULT 0,
  accounts_failed   INTEGER NOT NULL DEFAULT 0,
  error_details     JSONB,           -- per-account error log
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Modified Tables (Phase 2 additions)

```sql
-- ad_metrics_snapshots referenced from accounts for portfolio queries
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS has_ad_connections BOOLEAN NOT NULL DEFAULT false;

-- detect-signals now reads adMetricsSnapshot when trigger = 'ad_metrics_sync'
-- No schema change needed — transcript_jobs.trigger_source already handles this
```

---

## Cron Schedule Configuration

```typescript
// trigger/schedules/sync-ad-metrics.ts
import { schedules } from "@trigger.dev/sdk/v3";

// One schedule per workspace, created dynamically when workspace connects first ad account
export const syncAdMetricsSchedule = schedules.task({
  id: "sync-ad-metrics",
  // Deduplication key: one active run per workspace at a time
  // If a run is still in-flight when the next tick fires, skip
  maxConcurrencyKey: "workspace-{{ workspaceId }}",
  run: async (payload) => {
    // payload.scheduleId contains the workspaceId encoded at schedule creation
    const { workspaceId } = payload.externalId; // set at schedule creation
    
    const syncJobId = await createAdSyncJob(workspaceId, 'cron');
    
    await tasks.triggerAndWait("prepare-sync", {
      workspaceId,
      syncJobId,
      triggeredBy: 'cron',
    });
  },
});

// Called when workspace connects first ad account:
// await schedules.create({
//   task: "sync-ad-metrics",
//   cron: "0 * * * *",           // every hour
//   externalId: `workspace-${workspaceId}`,
//   deduplicationKey: `workspace-${workspaceId}`,
// });
```

---

## Progress Tracking

Ad Metrics Sync does not use `useRealtimeRun()` (no live UI subscription). Progress is tracked in the `ad_sync_jobs` table and polled by the Admin panel.

```typescript
// In each task, update the sync job record
async function updateSyncJobProgress(
  syncJobId: string,
  update: Partial<{
    status: string;
    accountsSynced: number;
    accountsFailed: number;
    errorDetails: Record<string, string>;
    completedAt: Date;
  }>
): Promise<void> {
  await db
    .update(adSyncJobs)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(adSyncJobs.id, syncJobId));
}
```

---

## Error Handling

| Error Type | Behavior | Retryable |
|---|---|---|
| OAuth token expired, refreshable | Refresh token → continue fetch | No retry needed |
| OAuth token expired, unrefreshable | Set connection `needs_reauth`, skip account | No (requires user action) |
| Ad platform API rate limit | Exponential backoff, Trigger.dev auto-retry | Yes (up to 3 retries) |
| Ad platform API error (5xx) | Log to error_details, mark pair failed, continue | Yes (up to 3 retries) |
| Ad platform API error (4xx invalid) | Log error, mark connection `needs_reauth` | No |
| Database write failure | Trigger.dev task retry from start (idempotent upserts) | Yes |
| detect-signals fire-and-forget fails | Independent task failure — does not affect sync job | Yes (own retry policy) |

```typescript
// Non-retryable errors use AbortTaskRunError
import { AbortTaskRunError } from "@trigger.dev/sdk/v3";

if (connection.status === 'needs_reauth') {
  // Don't retry — skip this connection and continue
  rawResults.push({
    accountId: connection.accountId,
    platform: connection.platform,
    success: false,
    error: 'connection_needs_reauth',
  });
  continue; // not throw — allows loop to continue
}

// Abort entire task only if workspace itself is invalid
if (!workspace) {
  throw new AbortTaskRunError(`Workspace ${workspaceId} not found`);
}
```

---

## File Locations

```
trigger/
├── schedules/
│   └── sync-ad-metrics.ts        # Cron schedule definition
├── tasks/
│   ├── prepare-sync.ts           # Task 1
│   ├── fetch-ad-metrics.ts       # Task 2
│   ├── normalize-and-save.ts     # Task 3
│   └── trigger-signal-refresh.ts # Task 4
└── utils/
    ├── ad-platform-clients.ts    # Google Ads / Meta / LinkedIn API wrappers
    ├── oauth-token-refresh.ts    # Token refresh logic per platform
    ├── normalize-metrics.ts      # Raw API response → NormalizedAdMetricRow
    └── build-snapshot.ts         # Aggregate rows → AdMetricsSnapshot

lib/
├── queries/
│   ├── ad-connections.ts         # DB queries for ad_connections table
│   ├── ad-metrics.ts             # DB queries for ad_metrics table
│   └── ad-sync-jobs.ts           # DB queries for ad_sync_jobs table
└── drizzle/
    └── schema/
        └── ad-metrics.ts         # Drizzle schema for all 4 new tables

app/
└── (protected)/
    └── accounts/
        └── [accountId]/
            └── _components/
                └── AdMetricsPanel.tsx  # Date range controller + chart
```

---

## UI: Date Range Controller

The Account Detail page shows ad metrics with a date range picker. The UI queries `ad_metrics` directly (not the snapshot) to support historical views.

```typescript
// Server Component: Account Detail page
// Reads ad_metrics filtered by date range
async function getAdMetrics(
  accountId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<NormalizedAdMetricRow[]> {
  return db
    .select()
    .from(adMetrics)
    .where(
      and(
        eq(adMetrics.accountId, accountId),
        gte(adMetrics.date, dateFrom),
        lte(adMetrics.date, dateTo)
      )
    )
    .orderBy(asc(adMetrics.date));
}

// Default: last 30 days
// User can select: last 7d / 30d / 90d / custom range
// searchParams: ?from=2026-03-01&to=2026-04-01
```

---

## Connection with Transcript Processing Workflow

This workflow activates the `adMetricsSnapshot` extension point defined in the Transcript Processing workflow.

```typescript
// detect-signals task (already exists from Phase 1)
// In Phase 2, populate adMetricsSnapshot instead of null:

// When triggered by transcript processing:
await tasks.triggerAndWait("detect-signals", {
  accountId,
  jobId: transcriptJobId,
  summaryText: generatedSummary,
  recentSummaries: last5Summaries,
  adMetricsSnapshot: await getAdMetricsSnapshot(accountId), // Phase 2: real data
  trigger: 'transcript_processing',
});

// When triggered by ad metrics sync:
await tasks.triggerAndForget("detect-signals", {
  accountId,
  jobId: null,
  summaryText: null,
  recentSummaries: await getLast5Summaries(accountId),
  adMetricsSnapshot: currentSnapshot,
  trigger: 'ad_metrics_sync',
});
```

---

## Implementation Checklist

### Database Migrations (run in order)

- [ ] 1. Create `ad_connections` table + indexes
- [ ] 2. Create `ad_metrics` table + indexes
- [ ] 3. Create `ad_metrics_snapshots` table + unique constraint
- [ ] 4. Create `ad_sync_jobs` table
- [ ] 5. Add `has_ad_connections` column to `accounts`
- [ ] 6. Add down migrations for all of the above

### Trigger.dev Tasks

- [ ] `prepare-sync.ts` — query connections, refresh tokens, build manifest
- [ ] `fetch-ad-metrics.ts` — Promise.all across manifest, error isolation
- [ ] `normalize-and-save.ts` — upsert rows, rebuild snapshot
- [ ] `trigger-signal-refresh.ts` — fire-and-forget detect-signals per account

### Cron Schedule

- [ ] `sync-ad-metrics.ts` — hourly schedule definition
- [ ] Schedule creation logic (triggered when first ad connection added to workspace)
- [ ] Schedule deletion logic (triggered when last ad connection removed)

### API Platform Clients

- [ ] `ad-platform-clients.ts` — Google Ads API v17, Meta Marketing API v18, LinkedIn Campaign Manager API v202401
- [ ] `oauth-token-refresh.ts` — per-platform token refresh handlers
- [ ] Environment variables: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

### UI Components

- [ ] `AdMetricsPanel.tsx` — date range picker + metrics chart
- [ ] "Connect Google Ads / Meta / LinkedIn" buttons on Account Detail page
- [ ] OAuth callback routes: `/api/auth/google-ads`, `/api/auth/meta`, `/api/auth/linkedin`
- [ ] Admin panel: ad_sync_jobs status view (accounts synced / failed)

### detect-signals Update

- [ ] Update `detect-signals` task to handle `trigger: 'ad_metrics_sync'` (no summaryText)
- [ ] Update LLM prompt to incorporate `adMetricsSnapshot` when present
- [ ] Update `adMetricsSnapshot` parameter from `null` to real data in transcript processing trigger
