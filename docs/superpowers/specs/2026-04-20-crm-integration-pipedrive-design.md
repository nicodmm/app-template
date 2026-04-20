# CRM Integration — Pipedrive end-to-end (Design Spec)

**Date:** 2026-04-20
**Status:** Approved, ready for implementation plan
**Module:** CRM Integration (sub-project 2a — first provider + framework)
**Unlocks:** sub-projects 2b HubSpot, 2c Kommo, 2d Dynamics, 2e advanced analytics, 2f custom property selection

## Goal

Let agency users connect each of their clients' CRM (starting with Pipedrive) to plani.fyi, sync deals + pipelines + stages, and see per-client dashboards that answer "what's in my pipeline and where did it come from?" — filtered by acquisition source and stage.

The module is designed as a **provider-agnostic framework** from day one so that adding HubSpot, Kommo, and Microsoft Dynamics later is purely a matter of writing a new provider implementation file — no schema, UI, or query layer changes.

## Scope

**In scope (2a):**
- Provider abstraction (`CrmProvider` interface) and factory.
- Pipedrive OAuth 2.0 flow and token refresh (reactive + proactive).
- Per-client CRM connection — one CRM connection per plani account.
- Sync of deals in user-selected pipelines and stages (open + won; lost excluded).
- All-time historical backfill (no time cap).
- Dashboard at `/app/accounts/[id]/crm` with tabs "Resumen" (KPIs + breakdown by source) and "Deals" (paginated table + filters).
- Multi-currency KPIs grouped by currency (no FX conversion).
- Source identified via Pipedrive standard `channel` field OR a user-chosen custom field.

**Out of scope (deferred to later sub-projects):**
- HubSpot / Kommo / Dynamics providers (2b/2c/2d).
- Win rate + funnel analytics (2e) — requires syncing lost deals.
- Custom property selection UI (2f) — field-by-field picker.
- Webhooks / real-time updates — hourly sync is sufficient.
- Activity, notes, task sync — just deals for MVP.
- Person / organization entity tables — names denormalized onto `crm_deals` row as text.
- FX normalization — per-currency totals only.
- Time-series charts + period-over-period comparisons.

## User-facing decisions (from brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | Connection scope | **Per-client** (one CRM connection per plani account) |
| 2 | Auth method | **OAuth 2.0** via private Pipedrive app |
| 3 | "Source" identification | **Standard `channel` + custom-field override** — mapping UI offers both |
| 4 | Pipeline/stage scope | **Pick pipeline(s) + specific stages at mapping time**. Stage filter applies only to `status=open`; won deals from selected pipelines are always synced. |
| 5 | Status to sync | **Open + won** (lost excluded) |
| 6 | Dashboard layout | **Tabs: Resumen + Deals** |
| 7 | Historical depth | **All-time, no limit** |
| 8 | Multi-currency | **Per-currency grouping, no FX** |

## Schema (Drizzle, new migration `0010_crm_schema`)

All tables prefixed `crm_`. All new tables use `uuid` primary keys with `defaultRandom()`.

```
crm_connections
  id (uuid PK)
  workspace_id → workspaces (cascade)
  account_id → accounts (cascade)
  provider text                      -- 'pipedrive' | 'hubspot' | 'kommo' | 'dynamics'
  external_user_id text              -- provider's user id
  external_company_id text
  external_company_domain text       -- Pipedrive subdomain, null for others
  access_token text
  refresh_token text
  token_expires_at timestamp
  status text                        -- 'active' | 'expired' | 'revoked'
  scope text                         -- granted OAuth scopes, for debug
  catalogs_last_refresh timestamp    -- when pipelines/stages/customfields were last fetched
  catalogs_configured_at timestamp   -- null until user completes mapping setup
  last_synced_at timestamp
  created_at / updated_at
  UNIQUE (account_id, provider)

crm_pipelines
  id (uuid PK)
  connection_id → crm_connections (cascade)
  external_id text
  name text
  is_synced boolean                  -- user's mapping choice
  UNIQUE (connection_id, external_id)

crm_stages
  id (uuid PK)
  pipeline_id → crm_pipelines (cascade)
  external_id text
  name text
  order_nr integer
  is_synced boolean                  -- user's mapping choice (affects open deals only)
  UNIQUE (pipeline_id, external_id)

crm_source_config
  connection_id → crm_connections (cascade) PK
  source_field_type text             -- 'channel' | 'custom'
  source_field_key text               -- 'channel' or Pipedrive custom_field hash

crm_sources                          -- catalog of possible source values for the
                                     -- currently configured source field. Wiped
                                     -- and re-populated whenever source_config
                                     -- source_field_key changes.
  id (uuid PK)
  connection_id → crm_connections (cascade)
  external_id text                   -- id in provider's catalog
  name text
  UNIQUE (connection_id, external_id)

crm_deals
  id (uuid PK)
  connection_id → crm_connections (cascade)
  account_id → accounts (cascade)    -- denormalized for dashboard queries
  external_id text                   -- Pipedrive deal id
  title text
  value numeric(18,2)
  currency char(3)                   -- 'USD', 'MXN', 'EUR', ...
  status text                        -- 'open' | 'won' (never 'lost')
  pipeline_id → crm_pipelines
  stage_id → crm_stages
  source_external_id text            -- logical FK into crm_sources, nullable
  owner_name text                    -- denormalized, not FK
  person_name text                   -- denormalized
  org_name text                      -- denormalized
  add_time timestamp                 -- Pipedrive's creation timestamp
  update_time timestamp
  won_time timestamp                 -- null unless status='won'
  raw_data jsonb                     -- provider-specific extras
  last_synced_at timestamp
  UNIQUE (connection_id, external_id)
  INDEX (account_id, add_time)
  INDEX (account_id, status)
  INDEX (connection_id, source_external_id)
```

**Deletion policy:** when a deal transitions to `lost` in Pipedrive, we DELETE the row from `crm_deals`. When a deal is deleted in Pipedrive (`is_deleted=true` flag), we also DELETE. Cascade FKs guarantee no orphan rows.

**Down migration:** `DROP TABLE` in dependency order (deals → sources/source_config → stages → pipelines → connections). Nothing else references these tables, so the down migration is purely `DROP`.

## Provider abstraction

File layout:

```
lib/crm/
  types.ts               -- provider-agnostic types
  provider.ts            -- CrmProvider interface + getProvider(id) factory
  providers/
    pipedrive.ts         -- Pipedrive v1 API implementation
    [later: hubspot.ts, kommo.ts, dynamics.ts]
  oauth.ts               -- state JWT sign/verify + error helpers
  sync.ts                -- generic fetchAndUpsertDeals() + fetchAndUpsertCatalogs()
  token-refresh.ts       -- reactive refresh wrapper + proactive cron logic
```

**Interface:**

```ts
export interface ConnectionContext {
  accessToken: string;
  apiDomain: string;       // Pipedrive: company-domain.pipedrive.com; others: api.provider.com
}

export interface CrmProvider {
  id: "pipedrive" | "hubspot" | "kommo" | "dynamics";
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    externalUserId: string;
    externalCompanyId: string;
    externalCompanyDomain: string | null;
    scope: string;
  }>;
  refreshToken(refreshToken: string): Promise<{ accessToken; refreshToken; expiresAt }>;
  fetchPipelines(conn: ConnectionContext): Promise<CrmPipeline[]>;
  fetchStages(conn: ConnectionContext, pipelineExternalId: string): Promise<CrmStage[]>;
  fetchCustomFields(conn: ConnectionContext): Promise<CrmCustomField[]>;
  fetchSourceCatalog(conn: ConnectionContext, sourceFieldKey: string): Promise<CrmSourceValue[]>;
  fetchDeals(params: {
    conn: ConnectionContext;
    pipelineExternalIds: string[];
    stageExternalIds: string[];      // applies only to open deals
    statuses: ("open" | "won")[];
    updatedSince?: Date;             // undefined = full backfill
  }): AsyncGenerator<CrmDeal>;
  fetchLostOrDeletedIdsSince(conn: ConnectionContext, updatedSince: Date): Promise<string[]>;
}

// Factory
export function getProvider(id: string): CrmProvider {
  switch (id) {
    case "pipedrive": return pipedriveProvider;
    default: throw new Error(`Unknown CRM provider: ${id}`);
  }
}
```

Adding HubSpot later = writing `providers/hubspot.ts` + one `case` in the factory.

## OAuth flow

**Routes (parameterized by provider):**

```
app/api/auth/crm/[provider]/login/route.ts
app/api/auth/crm/[provider]/callback/route.ts
```

Both use `getProvider(params.provider)` and dispatch.

**Login flow:**

1. User clicks "Conectar Pipedrive" on `/app/accounts/[id]/crm`.
2. GET `/api/auth/crm/pipedrive/login?accountId=<uuid>`:
   - Verifies user owns the account (workspace check).
   - Mints a state JWT signed with `CRM_STATE_SECRET` containing `{accountId, workspaceId, userId, nonce, exp: 10min}`.
   - Redirects to `provider.getAuthUrl(state)`.
3. User authorizes on Pipedrive.
4. Pipedrive redirects to `/api/auth/crm/pipedrive/callback?code=...&state=...`.
5. Callback:
   - Verifies state JWT (signature, exp, nonce not replayed).
   - `provider.exchangeCode(code)` → tokens.
   - Upserts `crm_connections` row (status='active').
   - Calls `fetchAndUpsertCatalogs(connection)` to seed `crm_pipelines` + `crm_stages` for the mapping UI.
   - Redirects to `/app/accounts/[id]/crm/setup`.

Custom fields are fetched **live** from the provider each time the mapping page loads (no caching table). The list is small (<50 typically) and rarely changes; caching is YAGNI.

**Error redirects** (from the callback):

| Condition | Redirect |
|---|---|
| `error=access_denied` (user declined) | `/app/accounts/[id]/crm?error=denied` |
| State JWT invalid / expired | `/app/settings/integrations?error=invalid_state` |
| Code exchange fails | Same, `error=exchange_failed` |
| Scope insufficient | Creates connection with `status=revoked` + banner "Permisos insuficientes" |

## Token refresh

**Reactive** (`lib/crm/token-refresh.ts`):

Wrapper `withRefresh(connection, fn)` that executes an API call, catches 401, calls `provider.refreshToken()`, persists new tokens, and retries the call exactly once. If refresh also fails → sets `status='revoked'` and throws.

All `provider.fetchX()` calls from sync tasks are invoked through this wrapper.

**Proactive** (cron task `refresh-crm-tokens`, daily 04:00):

```sql
SELECT * FROM crm_connections
WHERE status = 'active' AND token_expires_at < now() + interval '6 hours'
```

For each, call `provider.refreshToken()` and update. If refresh fails, set `status='expired'`. This prevents hourly syncs from racing expiring tokens.

## Mapping UI

**Page:** `/app/accounts/[id]/crm/setup` (server component).

Loads connection + cached pipelines/stages (from DB) + live custom fields (via `provider.fetchCustomFields()` — not cached). Renders `<CrmMappingForm>` client component.

**Form layout:**

1. Connection info header with "Desconectar" button.
2. Pipelines checkboxes (one per pipeline).
3. For each checked pipeline, expand the stages list (checkboxes). Note below: "Stages afectan solo a deals abiertos; los ganados se traen siempre del pipeline seleccionado."
4. Source field: radio between `channel` (default) and a dropdown of custom fields of type `enum`/`set` filtered from `fetchCustomFields()`.
5. "Guardar y sincronizar" button. While saving, shows toast "Sincronizando — tarda unos minutos; la página se actualizará sola."

**Server action `updateCrmMapping`** (`app/actions/crm.ts`):

```ts
export async function updateCrmMapping(input: {
  connectionId: string;
  syncedPipelineIds: string[];   // local uuids
  syncedStageIds: string[];
  sourceFieldType: "channel" | "custom";
  sourceFieldKey: string;
}): Promise<{ triggeredBackfill: boolean }>
```

1. Verifies user owns the connection (workspace check).
2. Updates `crm_pipelines.is_synced` and `crm_stages.is_synced`.
3. Upserts `crm_source_config`.
4. Sets `crm_connections.catalogs_configured_at = now()`.
5. Triggers `backfill-crm-account` with idempotency key `backfill-crm:${connectionId}:${pipelineIds.sort().join(',')}`:${sourceFieldKey}`. Changing the selection produces a new key → backfill re-runs.
6. `revalidatePath` for the crm dashboard + settings integrations page.
7. Returns `{ triggeredBackfill: true }`.

**Disconnect action:**

`disconnectCrmConnection(connectionId)` → `DELETE FROM crm_connections` (cascade purges pipelines, stages, sources, deals). Pipedrive tokens are not explicitly revoked from our side — the user can revoke from their Pipedrive panel if they want.

## Sync infrastructure

**Tasks:**

| File | Trigger | Purpose |
|---|---|---|
| `trigger/tasks/backfill-crm-account.ts` | On-demand (via mapping save) | Full sync: refresh catalogs + sync all open+won deals without time limit |
| `trigger/tasks/sync-crm-accounts.ts` | Cron `5 * * * *` | Fan-out to `syncSingleCrmAccount` for every configured connection |
| `trigger/tasks/sync-single-crm-account.ts` | Fan-out child (hidden task) | Incremental sync: refresh catalogs if > 24h stale, fetch deals updated since last_synced_at, delete lost/deleted |
| `trigger/tasks/refresh-crm-tokens.ts` | Cron `0 4 * * *` | Proactively refresh tokens expiring within 6h |

**Shared helpers (`lib/crm/sync.ts`):**

```ts
fetchAndUpsertCatalogs(connection): Promise<void>
  // Upserts crm_pipelines, crm_stages for all pipelines (preserves is_synced).
  // If crm_source_config exists, also upserts crm_sources for the configured source field.

fetchAndUpsertDeals(connection, updatedSince | null): Promise<{ upserted: number; deleted: number }>
  // Reads is_synced pipelines + stages from DB.
  // Calls provider.fetchDeals() via withRefresh().
  // Upserts into crm_deals with onConflictDoUpdate on (connection_id, external_id).
  // If updatedSince given, also calls provider.fetchLostOrDeletedIdsSince() and DELETEs those.
```

**Incremental sync overlap:**

`updatedSince = connection.last_synced_at - 5 minutes` to avoid missing deals modified in the second of the last sync boundary.

**Backfill task flow:**

```
1. fetchAndUpsertCatalogs(connection)
2. fetchAndUpsertDeals(connection, null)
3. connection.last_synced_at = now; connection.catalogs_last_refresh = now
retry: { maxAttempts: 2 }; maxDuration: 1800 (30 min for large accounts)
```

**Hourly single-account flow:**

```
1. If connection.catalogs_last_refresh < now - 24h → fetchAndUpsertCatalogs()
2. fetchAndUpsertDeals(connection, connection.last_synced_at - 5min)
3. connection.last_synced_at = now
retry: { maxAttempts: 3 }; maxDuration: 300
```

**Fan-out (`sync-crm-accounts`):**

```ts
const connections = await db.select().from(crmConnections)
  .where(and(
    eq(crmConnections.status, "active"),
    isNotNull(crmConnections.catalogsConfiguredAt)
  ));

await syncSingleCrmAccount.batchTrigger(
  connections.map(c => ({ payload: { connectionId: c.id } }))
);
```

## Dashboard

**Route:** `/app/accounts/[id]/crm` (server component).

**State handling:**
- No `crm_connection` for this account → render "Conectar Pipedrive" button.
- Connection exists but `catalogs_configured_at IS NULL` → redirect to `/crm/setup`.
- Connection + mapping + `status=revoked|expired` → banner "Reconectar Pipedrive" on top of dashboard; data still renders.
- Fully mapped + active → render tabs.

**Period selector:** same preset pattern as paid-media (`?preset=30` default, `?since=...&until=...` custom). Applies to:
- "Deals creados" metrics: filter by `add_time`.
- "Deals ganados" metrics: filter by `won_time`.

**Tab "Resumen":**

- KPI cards row (multi-currency aware):
  - Deals creados (count)
  - Deals ganados (count)
  - Valor abierto (sum value where status=open, grouped by currency)
  - Valor ganado (sum value where status=won and won_time in period, grouped by currency)
- Breakdown table sorted by "Deals creados" desc:
  - Columns: Fuente, Creados, Ganados, Valor abierto, Valor ganado
  - A "(sin fuente)" row aggregates deals with NULL source_external_id
  - Row click → drawer listing the deals for that source

**Tab "Deals":**

- Filters row: fuente (multi-select), stage (multi-select), status (open/won/all; default all)
- Table: 25 per page, columns Título, Fuente, Stage, Status badge, Valor+currency, Owner, Fecha creación
- Row click → drawer with deal detail (person_name, org_name, value, notes/links from raw_data)

**Multi-currency rendering:**

KPI card shows the primary currency large, others small beneath:

```
Valor ganado
USD $45,000
MXN $1.2M · EUR €12k
```

"Primary" = currency with the largest summed value in the period.

**Queries (`lib/queries/crm.ts`):**

```ts
getCrmConnectionState(workspaceId, accountId): ConnectionState
getCrmKpis(connectionId, since, until): { created; won; valueOpen; valueWon } // per currency
getCrmBreakdownBySource(connectionId, since, until): SourceRow[]
getCrmDeals(connectionId, filters, page): { deals: DealRow[]; totalPages: number }
getCrmFilterOptions(connectionId): { sources: SourceOption[]; stages: StageOption[] }
```

**Components (`components/`):**

```
crm-dashboard.tsx              -- wrapper with tabs + period selector
crm-summary-tab.tsx            -- KPIs + breakdown-by-source table
crm-deals-tab.tsx              -- filters + paginated table
crm-source-drawer.tsx          -- drawer opened from source row
crm-deal-drawer.tsx            -- drawer opened from deal row
crm-kpi-cards.tsx              -- reusable multi-currency KPI card
crm-mapping-form.tsx           -- form used by /crm/setup
```

## Error handling

**OAuth:** see the table in the OAuth flow section.

**Sync errors:**

| Error | Handling |
|---|---|
| HTTP 401 during fetch | `withRefresh` wrapper refreshes token and retries once |
| HTTP 429 | Read `Retry-After`, sleep, retry up to 3 times; abort account on 4th |
| HTTP 5xx | Retry-on-throw with exponential backoff (Trigger.dev retry config) |
| Refresh token revoked | `status = 'revoked'`; abort sync; banner in UI |
| Pipeline deleted in Pipedrive | On catalog refresh, mark `is_synced = false`; UI shows "pipeline removido, reconfigurar mapping" |
| Stage deleted in a synced pipeline | Same — `is_synced = false`; UI flag |
| Custom field used as source deleted | `crm_source_config.source_field_key` becomes orphan; source column in UI shows "(no configurado)" + link to re-setup |
| Pipedrive marks deal `is_deleted=true` | Row DELETE'd from `crm_deals` on next incremental sync |

**Connection status transitions:**

```
[new] → active         -- after successful OAuth callback
active → expired       -- proactive refresh task failed
active → revoked       -- reactive refresh (mid-sync) hit an invalid refresh_token
any → deleted          -- user hits "Desconectar" (cascade DELETE)
```

UI `/app/settings/integrations` renders a badge per connection based on status (green/yellow/red).

## Environment variables

Add to `lib/env.ts` (Zod schema) and to `.env.local`:

```
CRM_STATE_SECRET=<random 32-byte hex>
PIPEDRIVE_CLIENT_ID=<from developers.pipedrive.com>
PIPEDRIVE_CLIENT_SECRET=<from developers.pipedrive.com>
PIPEDRIVE_REDIRECT_URI=https://<your-app-domain>/api/auth/crm/pipedrive/callback
```

In dev: `PIPEDRIVE_REDIRECT_URI=http://localhost:3000/api/auth/crm/pipedrive/callback`.

**Pipedrive app creation steps (for the user, end of brainstorm):**

1. Go to https://developers.pipedrive.com → sign in with any Pipedrive account.
2. "Create an app" → choose "Private app" (marketplace not required).
3. **Callback URL:** matches `PIPEDRIVE_REDIRECT_URI` env.
4. **Scopes:** `deals:read`, `deals:full` (read + update for lost-detection), `users:read`, `contacts:read`, `admin` (needed for custom fields metadata — falls back gracefully if denied).
5. Copy Client ID + Client Secret into `.env.local`.
6. `openssl rand -hex 32` to generate `CRM_STATE_SECRET`.

## Verification plan (manual)

No automated test infra. Verification is the same pattern as Meta Ads:

1. Pipedrive app created, env vars set, dev server restarted.
2. Trigger.dev dev server running (`mcp__trigger__start_dev_server`).
3. Create a plani account for testing; navigate to `/app/accounts/[id]/crm`.
4. Click "Conectar Pipedrive" → authorize → land on `/crm/setup`.
5. Pick 1 pipeline + 3 stages + `channel` source → "Guardar y sincronizar".
6. Verify in DB: `crm_deals` populated, `crm_pipelines.is_synced` and `crm_stages.is_synced` correct, `crm_source_config` present.
7. Check Trigger.dev dashboard: `backfill-crm-account` run completed.
8. Dashboard `/app/accounts/[id]/crm`:
   - Tab "Resumen": KPIs match Pipedrive UI's filters for the same period. Breakdown rows align with sources.
   - Tab "Deals": filters work, sort works, pagination works, drawer opens on click.
9. Modify a deal in Pipedrive (change stage, mark won). Wait for next hourly sync or trigger `sync-single-crm-account` manually. Verify change propagates.
10. Mark a deal `lost` in Pipedrive. Next incremental sync: row should DELETE from `crm_deals`.
11. `npm run type-check` passes.
12. Manually revoke OAuth from Pipedrive UI. Next sync: connection transitions to `revoked`, banner shows.

## Non-goals (explicitly deferred)

- Win rate metric — excluded by design decision #5.
- Funnel analytics by stage — requires lost.
- FX normalization — per-currency totals only.
- Period comparison (current vs previous) — single period per view.
- Time-series chart of deals over time — snapshot KPIs only.
- Real-time webhooks — hourly is the cadence.
- Activities, notes, tasks sync — deals only.
- Person / organization entity tables.
- Pipedrive-to-plani writes (create deals, update stages from plani) — read-only MVP.

## Dependencies and impact on existing code

**New files:** everything under `lib/crm/`, `components/crm-*.tsx`, `app/api/auth/crm/`, `app/(protected)/app/accounts/[id]/crm/`, `app/(protected)/app/accounts/[id]/crm/setup/`, `app/actions/crm.ts`, `lib/queries/crm.ts`, `trigger/tasks/backfill-crm-account.ts` + `sync-crm-accounts.ts` + `sync-single-crm-account.ts` + `refresh-crm-tokens.ts`, schema files under `lib/drizzle/schema/crm_*.ts`.

**Modified files:**
- `lib/env.ts` — add 4 env vars.
- `app/(protected)/app/settings/integrations/page.tsx` — add "CRM" section.
- `lib/drizzle/schema/index.ts` — export new schema files.
- `trigger.config.ts` — register new cron schedules.

**No impact on:** Meta Ads module, auth, workspaces, other existing features.
