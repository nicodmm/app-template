# Meta Ads / Paid Media Module — Sub-Project 1 (MVP: Connection + Reporting)

**Date**: 2026-04-17
**Scope**: Sub-project 1 of 3 in the broader Paid Media module.
**Status**: Design approved, awaiting implementation plan.

---

## Context & Goal

plani.fyi is an account intelligence platform for growth agencies. It already tracks meetings, tasks, signals, and health per client account. This module adds a **Paid Media** capability that lets an agency:

1. See each client's Meta Ads performance updated hourly (reporting / visibility).
2. Receive automatic alerts when key metrics shift (signals) — *covered in sub-project 2*.
3. Get weekly recommendations that become tasks (recommendations) — *covered in sub-project 3*.

This spec covers **only sub-project 1**: connecting Meta Ads and displaying campaign-level performance in the UI. Sub-projects 2 and 3 depend on the data surface this one produces.

## Decomposition

- **Sub-project 1 (this spec)** — OAuth connection + hourly sync + mini-card on account page + full dashboard at `/app/accounts/[id]/paid-media` + settings page for ad account mapping.
- **Sub-project 2 (future)** — Signal triggers (7 alert types) plumbed into existing `signals` table.
- **Sub-project 3 (future)** — Weekly recommendations via Claude that auto-create tasks.

## Design Decisions (from brainstorming)

| Decision | Choice | Reasoning |
|---|---|---|
| Connection model | **Workspace-level OAuth, per-ad-account mapping** | One agency Meta login, then map each discovered ad account to a plani.fyi account. Per-account OAuth (where the client authenticates themselves) is deferred — can be added later by reusing the same callback with an extra `mode=per_account` flag. |
| Data granularity | **Up to campaign level** | Ad set / ad can be added later without schema rewrite. |
| Conversion tracking | **Configurable per ad account** (default `Lead`, override to `Purchase`, `CompleteRegistration`, custom) | Mix of B2B lead-gen (majority) and e-comm. |
| ROAS | **Only when `isEcommerce = true`** | B2B clients typically don't have conversion value in pixel. |
| Core metrics | Spend, Reach, Impressions, Clicks, CTR, CPC, CPM, Frequency, Conversions, CPA (+ ROAS if e-comm) | |
| Period ranges | **Presets (7/14/30 days) + custom range with comparison vs previous period** | Deltas are the main decision signal for reviews. |
| UI placement | **Mini-card in account page + dedicated `/app/accounts/[id]/paid-media` dashboard** | Glanceable KPIs without clogging the account page. |
| OAuth scope | **Workspace-level** | Agency user authenticates once, maps ad accounts to plani.fyi accounts afterward. |
| Sync cadence | **Hourly** | Meta API allows this easily. 15min is viable for later if data freshness matters. |
| Retention | **90 days rolling** for `meta_insights_daily` | Enough for 30-day + comparison windows. |
| Alert thresholds | **Fixed sensible defaults in MVP** | Per-account override is a phase-2 feature. |

## Schema

4 new tables + no changes to `accounts` (the existing `hasAdConnections` flag is reused).

### `meta_connections`

The OAuth connection, scoped to a workspace. Typically one per workspace (agency's Meta user).

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `workspaceId` | uuid → workspaces (cascade) | |
| `connectedByUserId` | uuid → users (set null) | who performed OAuth |
| `metaUserId` | text | Meta user ID |
| `metaUserName` | text | display |
| `accessToken` | text | stored plain in MVP (Supabase encrypts at rest); `pgcrypto` hardening is a follow-up |
| `tokenExpiresAt` | timestamp | long-lived tokens expire in ~60 days |
| `scopes` | text | comma-separated granted scopes |
| `status` | text | `active` / `expired` / `revoked` (default `active`) |
| `createdAt`, `updatedAt` | timestamp | |

### `meta_ad_accounts`

Ad accounts visible through a connection. Each can be mapped to one plani.fyi account.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `workspaceId` | uuid → workspaces (cascade) | |
| `connectionId` | uuid → meta_connections (cascade) | |
| `accountId` | uuid → accounts (set null) | **nullable** — unmapped = not assigned |
| `metaAdAccountId` | text | e.g. `"act_1234567890"` |
| `metaBusinessId` | text nullable | BM that owns the ad account |
| `name`, `currency`, `timezone` | text | pulled from Meta |
| `status` | integer | Meta status code (1 active, 2 disabled, etc.) |
| `isEcommerce` | boolean default false | when true, dashboard shows ROAS |
| `conversionEvent` | text default `"Lead"` | Meta action type key, e.g. `lead`, `purchase`, `complete_registration` |
| `lastSyncedAt` | timestamp nullable | |
| `createdAt`, `updatedAt` | timestamp | |

### `meta_campaigns`

Current state of each campaign (snapshot, overwritten on each sync).

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `adAccountId` | uuid → meta_ad_accounts (cascade) | |
| `metaCampaignId` | text | |
| `name` | text | |
| `status` | text | `ACTIVE` / `PAUSED` / `DELETED` / `ARCHIVED` |
| `objective` | text | Meta objective (`LEAD_GENERATION`, `OUTCOME_LEADS`, etc.) |
| `dailyBudget`, `lifetimeBudget` | integer nullable | in cents of ad account currency |
| `startTime`, `stopTime` | timestamp nullable | |
| `lastSyncedAt` | timestamp | |

Unique on `(adAccountId, metaCampaignId)`.

### `meta_insights_daily`

Daily campaign metrics. Idempotent on `(adAccountId, campaignId, date)`.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `adAccountId` | uuid → meta_ad_accounts (cascade) | |
| `campaignId` | uuid → meta_campaigns (cascade) nullable | null for account-level rollup rows (future) |
| `date` | date | |
| `spend` | integer | cents |
| `impressions`, `reach`, `clicks` | integer | |
| `conversions` | integer | count of the configured `conversionEvent` |
| `conversionValue` | integer nullable | cents, only when `isEcommerce` |
| `frequency` | numeric(4,2) | |
| `createdAt` | timestamp | |

Unique index `(adAccountId, campaignId, date)`. Additional index on `(adAccountId, date DESC)` for period queries.

## OAuth Flow

### Initial connection (workspace-level)

```
1. User on account page's mini-card → no connection → clicks "Conectar Meta Ads"
2. GET /api/auth/meta/login
   - Generates random state token
   - Sets httpOnly cookie "__Host-meta_oauth_state"
   - Redirects to:
     https://www.facebook.com/v19.0/dialog/oauth
       ?client_id=$META_APP_ID
       &redirect_uri=$META_OAUTH_REDIRECT_URI
       &scope=ads_read,business_management
       &state=<token>
3. User authenticates on Meta, approves scopes
4. Meta redirects to /api/auth/meta/callback?code=...&state=...
5. Callback handler:
   a. Validates state matches cookie (CSRF protection)
   b. Exchanges code for short-lived token:
      GET /v19.0/oauth/access_token
        ?client_id=$META_APP_ID
        &client_secret=$META_APP_SECRET
        &redirect_uri=$META_OAUTH_REDIRECT_URI
        &code=<code>
   c. Exchanges short-lived for long-lived token (~60 days):
      GET /v19.0/oauth/access_token
        ?grant_type=fb_exchange_token
        &client_id=$META_APP_ID
        &client_secret=$META_APP_SECRET
        &fb_exchange_token=<short>
   d. GET /me → metaUserId, metaUserName
   e. Insert meta_connections row
   f. GET /me/adaccounts?fields=account_id,name,currency,timezone_name,account_status,business
      Upsert into meta_ad_accounts (accountId left null)
   g. Redirect to /app/settings/integrations?connected=meta
```

### Ad-account mapping (post-OAuth)

Page `/app/settings/integrations` renders:

- All active connections for the workspace (with token expiry date).
- All ad accounts visible through those connections, each with:
  - `<select>` to map to a plani.fyi account (workspace's accounts).
  - Checkbox `isEcommerce`.
  - `<select>` for `conversionEvent`.
- Server action `updateAdAccountMapping(adAccountId, accountId, isEcommerce, conversionEvent)` updates the row.

Mapping an ad account for the first time triggers `backfill-meta-ads(adAccountId)` to pull 90 days of insights.

### Reconnection on expiry

When a sync run gets Graph API error code `190` (OAuthException, token invalid):

1. Set `meta_connections.status = "expired"`.
2. Subsequent sync runs skip ad accounts tied to expired connections.
3. Account page mini-card shows red banner "Reconectar Meta" that redispatches `GET /api/auth/meta/login`.

## Sync Workers (Trigger.dev v4)

### `sync-meta-ads` — hourly cron (:05)

Scheduled task. For every ad account with `accountId != null` and an active connection:

```
1. GET /{adAccountId}/campaigns
   fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time
   → upsert meta_campaigns by (adAccountId, metaCampaignId)

2. GET /{adAccountId}/insights
   level=campaign
   time_range={since: today - 3, until: today}   ← rolling 3 days for late attribution
   time_increment=1
   fields=spend,impressions,reach,clicks,frequency,actions,action_values
   → for each row:
       - parse actions[] for the ad account's configured conversionEvent
       - parse action_values[] only when isEcommerce
       - upsert meta_insights_daily by (adAccountId, campaignId, date)

3. UPDATE meta_ad_accounts SET lastSyncedAt = NOW()
```

Fan-out pattern: the cron fetches the list of ad accounts then uses `sync-single-ad-account.batchTrigger()` so each ad account runs in parallel with isolated error handling.

### `backfill-meta-ads(adAccountId)` — one-shot

Triggered when an ad account is first mapped. Same as the hourly sync but with `time_range: last 90 days`. Paginates if Meta returns a cursor.

### `refresh-meta-tokens` — daily cron (3am)

For every `meta_connections` with `tokenExpiresAt < NOW() + 7 days` and `status = active`:

```
GET /v19.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=$META_APP_ID
  &client_secret=$META_APP_SECRET
  &fb_exchange_token=<current>

→ success: update accessToken + tokenExpiresAt
→ failure: status = "expired"
```

### Graph API error handling

| code / subcode | meaning | action |
|---|---|---|
| `190` | Token expired / revoked | Mark connection `expired`, stop sync for it |
| `17`, `4` | App / user rate limit | Exponential backoff, retry |
| `613` | Ad account rate limit | Skip this ad account, retry next hour |
| `100` | Invalid parameter | Log + `AbortTaskRunError` (investigation needed) |
| 5xx | Server error | Automatic Trigger.dev retry |

### Performance estimate

20 mapped ad accounts × ~3 API calls per hour = 60 calls/hour. Meta's default rate limit in dev is ~200 calls/hour/user/app. Comfortable margin.

## UI

### 5.1 — Mini-card on account page

Non-collapsible (KPIs should be glanceable). Four states:

- **No workspace connection**: CTA "Conectar Meta Ads" → triggers OAuth.
- **Connection exists but ad account unmapped**: "Vincular ad account" → modal with select.
- **Mapped + synced**: 4 KPIs (Spend · CPA/CPL · CTR · Conversions) with delta vs previous period. Default period: last 7 days. Small footer: "N campañas activas · sync hace X min" + `Ver todo →` link.
- **Token expired**: red banner "Reconectar Meta" above the card.

### 5.2 — Full dashboard `/app/accounts/[accountId]/paid-media`

Header:

- Breadcrumb `Portfolio / <Account name> / Paid Media`.
- Period selector: presets (7/14/30) + custom range (two `<input type="date">`).
- Toggle "Comparar con período anterior" (default on).
- Footer metadata: "Última sync: hace X min".

KPI row (6 cards, each shows value + delta %): `Spend · Impressions · Reach · Clicks · CTR · CPM`.
Second row (3 cards): `Conversions · CPA · Frequency` (+ ROAS card if `isEcommerce`).

Campaigns table:

| Campaña | Estado | Spend | Impr. | CTR | CPC | Conv. | CPA | Freq |

- Sortable by any column.
- Filter by status (Active / Paused / All).
- Row click → side drawer with 30-day line chart (spend + conversions dual-axis) + metadata (objective, budget, start/stop time).

### 5.3 — Settings → Integrations `/app/settings/integrations`

Lists workspace's Meta connections (status, token expiry, disconnect button) and all discoverable ad accounts. Each row allows:

- Mapping to a plani.fyi account via select.
- Toggling `isEcommerce`.
- Picking `conversionEvent` from a dropdown (Lead, CompleteRegistration, Contact, Purchase, + custom conversion event names pulled from Meta's catalog if feasible).

Disconnecting cascades: deletes `meta_connections` and related ad accounts, campaigns, and insights.

### Visual/interaction decisions

- **Sparklines in KPIs**: not in MVP.
- **Campaign drawer with 30-day trend**: yes in MVP.
- **Mini-card default period**: 7 days.
- **Charting library**: `recharts` (new dependency).

## Files (new + modified)

### New

**Schema / migration**
- `lib/drizzle/schema/meta_connections.ts`
- `lib/drizzle/schema/meta_ad_accounts.ts`
- `lib/drizzle/schema/meta_campaigns.ts`
- `lib/drizzle/schema/meta_insights_daily.ts`
- `drizzle/migrations/0005_<name>.sql` + corresponding `down.sql`

**Server / actions / routes**
- `app/api/auth/meta/login/route.ts`
- `app/api/auth/meta/callback/route.ts`
- `app/actions/meta-connections.ts` (disconnect, map ad account, update mapping)
- `app/(protected)/app/settings/integrations/page.tsx`
- `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx`

**Lib**
- `lib/meta/client.ts` — Graph API wrapper with error code handling
- `lib/meta/oauth.ts` — code-for-token and token exchange helpers
- `lib/meta/sync-insights.ts` — parse `actions[]` / `action_values[]`, upsert helpers
- `lib/queries/paid-media.ts` — KPI aggregation with period + comparison params

**Trigger.dev tasks**
- `trigger/tasks/sync-meta-ads.ts` (scheduled cron, hourly)
- `trigger/tasks/sync-single-ad-account.ts` (fan-out target)
- `trigger/tasks/backfill-meta-ads.ts` (one-shot on first mapping)
- `trigger/tasks/refresh-meta-tokens.ts` (scheduled daily)

**Components**
- `components/paid-media-mini-card.tsx`
- `components/paid-media-dashboard.tsx`
- `components/paid-media-campaigns-table.tsx`
- `components/paid-media-kpi-card.tsx`
- `components/paid-media-period-selector.tsx`
- `components/paid-media-campaign-drawer.tsx`
- `components/ad-account-mapping-form.tsx`

### Modified

- `lib/drizzle/schema/index.ts` — export new schemas
- `lib/env.ts` — add `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`
- `app/(protected)/app/accounts/[accountId]/page.tsx` — mount `PaidMediaMiniCard`
- `package.json` — add `recharts`

## Operational / Security

- `meta_connections.accessToken`: plain in MVP (Supabase encrypts at rest). Follow-up: wrap with `pgcrypto` using `META_TOKEN_ENCRYPTION_KEY`.
- OAuth state cookie: `__Host-meta_oauth_state`, httpOnly, sameSite=lax, secure in prod.
- Token is never sent to the client — queries in `lib/queries/paid-media.ts` explicitly exclude it.
- `/api/auth/meta/*` require an authenticated Supabase session.
- Meta App mode: Development for MVP (only users added as Tester/Developer/Admin in the Meta App can authenticate). App Review required before inviting non-internal users.

## Out of Scope (for Sub-project 1)

- Signal/alert triggers based on ads data (sub-project 2).
- Weekly AI-generated recommendations and auto-created tasks (sub-project 3).
- Ad set / ad level data and creative previews.
- Breakdowns by audience / placement / device / demographic.
- Export to CSV / PDF.
- Google Ads, TikTok, LinkedIn ads (future platforms).
- Per-account threshold overrides for alerts.
- Sparklines in KPI cards.
- `pgcrypto` token encryption (security hardening follow-up).

## Success Criteria

- Agency user can complete OAuth and see their ad accounts in `/app/settings/integrations`.
- Mapping an ad account to a plani.fyi account populates 90 days of historical insights within 5 minutes.
- Hourly sync keeps data fresh within ±1 hour of Meta's numbers (±5% deviation acceptable on today's running day due to Meta's real-time attribution lag).
- Account page mini-card shows the 4 KPIs with correct deltas.
- Full dashboard loads in under 2 seconds for a typical account (≤50 campaigns, 90 days of data).
- Token refresh keeps connections alive indefinitely without manual re-auth as long as the user doesn't revoke access in Meta.
- Revoked or expired tokens surface clearly in the UI with a one-click reconnect path.
