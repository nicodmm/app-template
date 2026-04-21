# CRM Integration — Pipedrive (sub-project 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an end-to-end Pipedrive CRM integration for plani.fyi — per-client OAuth, pipeline+stage mapping, hourly sync, deals dashboard — on a provider-agnostic framework so HubSpot/Kommo/Dynamics can be added later by writing only a new provider file.

**Architecture:** Provider-agnostic schema (common fields + `raw_data` jsonb). Single `CrmProvider` interface in `lib/crm/provider.ts`. One implementation per provider in `lib/crm/providers/pipedrive.ts`. Generic routes `app/api/auth/crm/[provider]/{login,callback}` and generic tasks (`sync-crm-accounts`, `backfill-crm-account`, `refresh-crm-tokens`) dispatch to the provider via a factory. Per-client connections (one `crm_connections` row per plani account). Hourly incremental sync + 24h-stale catalog refresh + daily proactive token refresh.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + Postgres, Trigger.dev v3 for scheduled tasks, Supabase Auth, Tailwind v4 + shadcn/ui, `@t3-oss/env-nextjs` + Zod, `jose` for state JWT (already in deps via Supabase).

**Spec:** `docs/superpowers/specs/2026-04-20-crm-integration-pipedrive-design.md`

**Codebase conventions to follow:**
- `requireUserId()` + `getWorkspaceByUserId()` for auth in actions/pages (see `app/actions/meta-connections.ts`).
- `revalidatePath("/app/settings/integrations")` + `revalidatePath(\`/app/accounts/${accountId}\`)` after mutations.
- No automated test infra — verification is `npm run type-check` + manual in-app + DB inspection + Trigger.dev dev logs.
- Stage **specific file paths** when committing; never `git add -A`.
- Every new migration needs a `down.sql` before running `db:migrate`.

---

## File Structure

**New files:**

```
drizzle/migrations/
  0010_crm_schema.sql                           -- 6 CREATE TABLEs
  0010_crm_schema/down.sql                      -- 6 DROP TABLEs in dep order

lib/drizzle/schema/
  crm_connections.ts
  crm_pipelines.ts
  crm_stages.ts
  crm_source_config.ts
  crm_sources.ts
  crm_deals.ts

lib/crm/
  types.ts                                      -- CrmDeal, CrmPipeline, etc (provider-agnostic)
  provider.ts                                   -- CrmProvider interface + getProvider() factory
  providers/
    pipedrive.ts                                -- Pipedrive v1 implementation
  oauth.ts                                      -- state JWT sign/verify
  sync.ts                                       -- fetchAndUpsertCatalogs, fetchAndUpsertDeals
  token-refresh.ts                              -- withRefresh wrapper + proactive cron logic
  errors.ts                                     -- CrmApiError (mirrors MetaApiError)

app/api/auth/crm/[provider]/
  login/route.ts
  callback/route.ts

app/actions/crm.ts                              -- updateCrmMapping, disconnectCrmConnection
lib/queries/crm.ts                              -- getCrmConnectionState, KPIs, breakdown, deals

app/(protected)/app/accounts/[id]/crm/
  page.tsx                                      -- dashboard
  setup/page.tsx                                -- mapping UI

components/
  crm-dashboard.tsx
  crm-summary-tab.tsx
  crm-deals-tab.tsx
  crm-source-drawer.tsx
  crm-deal-drawer.tsx
  crm-kpi-cards.tsx
  crm-mapping-form.tsx

trigger/tasks/
  backfill-crm-account.ts
  sync-crm-accounts.ts
  sync-single-crm-account.ts
  refresh-crm-tokens.ts
```

**Modified files:**

- `lib/env.ts` — add `CRM_STATE_SECRET`, `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET`, `PIPEDRIVE_REDIRECT_URI`.
- `lib/drizzle/schema/index.ts` — export new schema files.
- `app/(protected)/app/settings/integrations/page.tsx` — CRM section.
- `drizzle/migrations/meta/_journal.json` — auto-generated entry.

---

## Phase 1 — Foundation

### Task 1: Pipedrive app + env vars (manual user steps, then env.ts)

**Files:**
- Manual: developers.pipedrive.com — create private app
- Manual: `.env.local`
- Modify: `lib/env.ts`

- [ ] **Step 1: User creates Pipedrive app**

The implementer must ask the user to do this once (or verify it's done):

1. Sign in at https://developers.pipedrive.com.
2. Apps → "Create an app" → "Private app".
3. Callback URL: `http://localhost:3000/api/auth/crm/pipedrive/callback` (dev). In production, use the app's public URL.
4. Scopes: `deals:read`, `deals:full`, `users:read`, `contacts:read`, `admin` (admin needed to list custom fields metadata; degrades gracefully).
5. Copy Client ID + Client Secret.

- [ ] **Step 2: Set env vars in `.env.local`**

Add to `.env.local`:

```
CRM_STATE_SECRET=<openssl rand -hex 32>
PIPEDRIVE_CLIENT_ID=<from step 1>
PIPEDRIVE_CLIENT_SECRET=<from step 1>
PIPEDRIVE_REDIRECT_URI=http://localhost:3000/api/auth/crm/pipedrive/callback
```

Generate the secret with `openssl rand -hex 32` (any 64-char hex string).

- [ ] **Step 3: Add env vars to Zod schema**

Replace `lib/env.ts` with:

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    META_APP_ID: z.string().min(1),
    META_APP_SECRET: z.string().min(1),
    META_OAUTH_REDIRECT_URI: z.string().url(),
    CRM_STATE_SECRET: z.string().min(32),
    PIPEDRIVE_CLIENT_ID: z.string().min(1),
    PIPEDRIVE_CLIENT_SECRET: z.string().min(1),
    PIPEDRIVE_REDIRECT_URI: z.string().url(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_OAUTH_REDIRECT_URI: process.env.META_OAUTH_REDIRECT_URI,
    CRM_STATE_SECRET: process.env.CRM_STATE_SECRET,
    PIPEDRIVE_CLIENT_ID: process.env.PIPEDRIVE_CLIENT_ID,
    PIPEDRIVE_CLIENT_SECRET: process.env.PIPEDRIVE_CLIENT_SECRET,
    PIPEDRIVE_REDIRECT_URI: process.env.PIPEDRIVE_REDIRECT_URI,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
```

- [ ] **Step 4: Verify**

Run:
```
npm run type-check
```
Expected: exit 0 (no errors). Also restart the dev server (`npm run dev`) to pick up new env vars — if Zod rejects, you'll see the validation error in the terminal and the app won't boot.

- [ ] **Step 5: Commit**

```
git add lib/env.ts
git commit -m "feat(crm): add Pipedrive + CRM state env vars"
```

(Do not commit `.env.local`.)

---

### Task 2: Drizzle schema — 6 new tables

**Files:**
- Create: `lib/drizzle/schema/crm_connections.ts`
- Create: `lib/drizzle/schema/crm_pipelines.ts`
- Create: `lib/drizzle/schema/crm_stages.ts`
- Create: `lib/drizzle/schema/crm_source_config.ts`
- Create: `lib/drizzle/schema/crm_sources.ts`
- Create: `lib/drizzle/schema/crm_deals.ts`
- Modify: `lib/drizzle/schema/index.ts`

- [ ] **Step 1: `crm_connections.ts`**

```ts
import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { accounts } from "./accounts";

export const crmConnections = pgTable(
  "crm_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalUserId: text("external_user_id").notNull(),
    externalCompanyId: text("external_company_id").notNull(),
    externalCompanyDomain: text("external_company_domain"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at").notNull(),
    status: text("status").notNull().default("active"),
    scope: text("scope"),
    catalogsLastRefresh: timestamp("catalogs_last_refresh"),
    catalogsConfiguredAt: timestamp("catalogs_configured_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_connections_account_provider_idx").on(t.accountId, t.provider)]
);

export type CrmConnection = typeof crmConnections.$inferSelect;
export type NewCrmConnection = typeof crmConnections.$inferInsert;
```

- [ ] **Step 2: `crm_pipelines.ts`**

```ts
import { pgTable, text, timestamp, uuid, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { crmConnections } from "./crm_connections";

export const crmPipelines = pgTable(
  "crm_pipelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => crmConnections.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    isSynced: boolean("is_synced").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_pipelines_unique_idx").on(t.connectionId, t.externalId)]
);

export type CrmPipeline = typeof crmPipelines.$inferSelect;
export type NewCrmPipeline = typeof crmPipelines.$inferInsert;
```

- [ ] **Step 3: `crm_stages.ts`**

```ts
import { pgTable, text, timestamp, uuid, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { crmPipelines } from "./crm_pipelines";

export const crmStages = pgTable(
  "crm_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => crmPipelines.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    orderNr: integer("order_nr").notNull().default(0),
    isSynced: boolean("is_synced").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_stages_unique_idx").on(t.pipelineId, t.externalId)]
);

export type CrmStage = typeof crmStages.$inferSelect;
export type NewCrmStage = typeof crmStages.$inferInsert;
```

- [ ] **Step 4: `crm_source_config.ts`**

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { crmConnections } from "./crm_connections";

export const crmSourceConfig = pgTable("crm_source_config", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => crmConnections.id, { onDelete: "cascade" }),
  sourceFieldType: text("source_field_type").notNull(),
  sourceFieldKey: text("source_field_key").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CrmSourceConfig = typeof crmSourceConfig.$inferSelect;
export type NewCrmSourceConfig = typeof crmSourceConfig.$inferInsert;
```

- [ ] **Step 5: `crm_sources.ts`**

```ts
import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { crmConnections } from "./crm_connections";

export const crmSources = pgTable(
  "crm_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => crmConnections.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_sources_unique_idx").on(t.connectionId, t.externalId)]
);

export type CrmSource = typeof crmSources.$inferSelect;
export type NewCrmSource = typeof crmSources.$inferInsert;
```

- [ ] **Step 6: `crm_deals.ts`**

```ts
import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { crmConnections } from "./crm_connections";
import { accounts } from "./accounts";
import { crmPipelines } from "./crm_pipelines";
import { crmStages } from "./crm_stages";

export const crmDeals = pgTable(
  "crm_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => crmConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    value: numeric("value", { precision: 18, scale: 2 }),
    currency: text("currency"),
    status: text("status").notNull(),
    pipelineId: uuid("pipeline_id").references(() => crmPipelines.id, { onDelete: "set null" }),
    stageId: uuid("stage_id").references(() => crmStages.id, { onDelete: "set null" }),
    sourceExternalId: text("source_external_id"),
    ownerName: text("owner_name"),
    personName: text("person_name"),
    orgName: text("org_name"),
    addTime: timestamp("add_time").notNull(),
    updateTime: timestamp("update_time").notNull(),
    wonTime: timestamp("won_time"),
    rawData: jsonb("raw_data"),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_deals_unique_idx").on(t.connectionId, t.externalId),
    index("crm_deals_account_addtime_idx").on(t.accountId, t.addTime),
    index("crm_deals_account_status_idx").on(t.accountId, t.status),
    index("crm_deals_connection_source_idx").on(t.connectionId, t.sourceExternalId),
  ]
);

export type CrmDeal = typeof crmDeals.$inferSelect;
export type NewCrmDeal = typeof crmDeals.$inferInsert;
```

- [ ] **Step 7: Export from schema index**

Append to `lib/drizzle/schema/index.ts`:

```ts
export * from "./crm_connections";
export * from "./crm_pipelines";
export * from "./crm_stages";
export * from "./crm_source_config";
export * from "./crm_sources";
export * from "./crm_deals";
```

- [ ] **Step 8: Type-check**

Run: `npm run type-check`. Expected: exit 0.

- [ ] **Step 9: Commit**

```
git add lib/drizzle/schema/crm_*.ts lib/drizzle/schema/index.ts
git commit -m "feat(crm): drizzle schema for CRM tables"
```

---

### Task 3: Generate migration + write down.sql + apply

**Files:**
- Auto-generated: `drizzle/migrations/0010_<hash>_<name>.sql`
- Create: `drizzle/migrations/0010_<hash>_<name>/down.sql`

- [ ] **Step 1: Generate migration**

Run: `npm run db:generate`

Expected: new SQL file at `drizzle/migrations/0010_*.sql` containing `CREATE TABLE` for the 6 tables. Note the generated folder name (e.g. `0010_thin_prodigy`) — use it for the down folder.

- [ ] **Step 2: Write down migration**

Create `drizzle/migrations/0010_<same-folder-name>/down.sql`:

```sql
DROP TABLE IF EXISTS "crm_deals" CASCADE;
DROP TABLE IF EXISTS "crm_sources" CASCADE;
DROP TABLE IF EXISTS "crm_source_config" CASCADE;
DROP TABLE IF EXISTS "crm_stages" CASCADE;
DROP TABLE IF EXISTS "crm_pipelines" CASCADE;
DROP TABLE IF EXISTS "crm_connections" CASCADE;
```

- [ ] **Step 3: Apply migration**

Run: `npm run db:migrate`

Expected: "Migrations complete". If you hit a "relation already exists" error, the migration was partially applied — run the down migration SQL manually in Supabase SQL editor, then retry.

- [ ] **Step 4: Verify tables exist**

Quick check via a throwaway script (optional): run a `select tablename` on `pg_tables where tablename LIKE 'crm_%'` via `psql` or Supabase. Expect 6 rows.

- [ ] **Step 5: Commit**

```
git add drizzle/migrations/0010_*
git commit -m "feat(crm): migration 0010 for CRM schema"
```

---

## Phase 2 — Provider abstraction + Pipedrive impl

### Task 4: Provider-agnostic types

**Files:**
- Create: `lib/crm/types.ts`

- [ ] **Step 1: Write types**

```ts
// lib/crm/types.ts

export type CrmProviderId = "pipedrive" | "hubspot" | "kommo" | "dynamics";
export type CrmDealStatus = "open" | "won";

export interface ConnectionContext {
  accessToken: string;
  apiDomain: string;   // Pipedrive: company-domain.pipedrive.com; others: api.provider.com
}

export interface ConnectionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface ExchangeResult extends ConnectionTokens {
  externalUserId: string;
  externalCompanyId: string;
  externalCompanyDomain: string | null;
  scope: string;
}

export interface CrmPipeline {
  externalId: string;
  name: string;
  orderNr?: number;
}

export interface CrmStage {
  externalId: string;
  pipelineExternalId: string;
  name: string;
  orderNr: number;
}

export interface CrmCustomField {
  key: string;          // Pipedrive field hash (e.g. "abc123..."); stable identifier
  name: string;         // human label
  fieldType: string;    // e.g. "enum", "set", "varchar" — only enum/set are candidates for source
  options?: { id: string; label: string }[];
}

export interface CrmSourceValue {
  externalId: string;
  name: string;
}

export interface CrmDeal {
  externalId: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: CrmDealStatus;                      // lost filtered out in provider
  pipelineExternalId: string;
  stageExternalId: string;
  sourceExternalId: string | null;
  ownerName: string | null;
  personName: string | null;
  orgName: string | null;
  addTime: Date;
  updateTime: Date;
  wonTime: Date | null;
  rawData: Record<string, unknown>;
}
```

- [ ] **Step 2: Type-check + commit**

```
npm run type-check
git add lib/crm/types.ts
git commit -m "feat(crm): provider-agnostic types"
```

---

### Task 5: CrmProvider interface + factory

**Files:**
- Create: `lib/crm/provider.ts`

- [ ] **Step 1: Write interface**

```ts
// lib/crm/provider.ts
import type {
  ConnectionContext,
  CrmProviderId,
  CrmPipeline,
  CrmStage,
  CrmCustomField,
  CrmSourceValue,
  CrmDeal,
  ConnectionTokens,
  ExchangeResult,
  CrmDealStatus,
} from "./types";

export interface CrmProvider {
  id: CrmProviderId;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<ExchangeResult>;
  refreshToken(refreshToken: string): Promise<ConnectionTokens>;
  fetchPipelines(conn: ConnectionContext): Promise<CrmPipeline[]>;
  fetchStages(conn: ConnectionContext, pipelineExternalId: string): Promise<CrmStage[]>;
  fetchCustomFields(conn: ConnectionContext): Promise<CrmCustomField[]>;
  fetchSourceCatalog(
    conn: ConnectionContext,
    sourceFieldType: "channel" | "custom",
    sourceFieldKey: string
  ): Promise<CrmSourceValue[]>;
  fetchDeals(params: {
    conn: ConnectionContext;
    pipelineExternalIds: string[];
    openStageExternalIds: string[];
    statuses: CrmDealStatus[];
    sourceFieldType: "channel" | "custom";
    sourceFieldKey: string;
    updatedSince?: Date;
  }): AsyncGenerator<CrmDeal>;
  fetchLostOrDeletedIdsSince(
    conn: ConnectionContext,
    updatedSince: Date
  ): Promise<string[]>;
}

// Factory — adding a provider = add a case and a file.
import { pipedriveProvider } from "./providers/pipedrive";

export function getProvider(id: string): CrmProvider {
  switch (id) {
    case "pipedrive":
      return pipedriveProvider;
    default:
      throw new Error(`Unknown CRM provider: ${id}`);
  }
}
```

- [ ] **Step 2: Commit (will fail type-check until Task 7 lands — OK, hold the commit)**

Don't commit yet. This file imports `./providers/pipedrive` which doesn't exist. We'll commit together with Task 7 when Pipedrive impl is written.

---

### Task 6: CRM error class + Pipedrive HTTP helper

**Files:**
- Create: `lib/crm/errors.ts`
- Create: `lib/crm/providers/pipedrive-http.ts` (internal helper, not part of public interface)

- [ ] **Step 1: Error class**

```ts
// lib/crm/errors.ts
export class CrmApiError extends Error {
  constructor(
    public code: number,
    public provider: string,
    message: string,
    public raw?: unknown
  ) {
    super(message);
    this.name = "CrmApiError";
  }

  isAuthError(): boolean {
    return this.code === 401;
  }

  isRateLimit(): boolean {
    return this.code === 429;
  }
}
```

- [ ] **Step 2: Pipedrive HTTP helper**

```ts
// lib/crm/providers/pipedrive-http.ts
import { CrmApiError } from "../errors";

interface PipedriveFetchOptions {
  accessToken: string;
  apiDomain: string;             // e.g. "company.pipedrive.com"
  searchParams?: Record<string, string | number | undefined>;
  method?: "GET" | "POST";
  body?: unknown;
}

export async function pipedriveFetch<T>(
  path: string,
  opts: PipedriveFetchOptions
): Promise<T> {
  const params = new URLSearchParams();
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
  }
  const url = `https://${opts.apiDomain}${path}${params.toString() ? `?${params.toString()}` : ""}`;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "1", 10);
    throw new CrmApiError(429, "pipedrive", `Rate limited; retry after ${retryAfter}s`);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new CrmApiError(0, "pipedrive", `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const errMsg =
      (json as { error?: string; error_info?: string })?.error ??
      (json as { error_info?: string })?.error_info ??
      `HTTP ${res.status}`;
    throw new CrmApiError(res.status, "pipedrive", errMsg, json);
  }

  return json as T;
}

export async function* pipedrivePaginate<T>(
  path: string,
  opts: PipedriveFetchOptions
): AsyncGenerator<T, void, void> {
  let start = 0;
  const limit = 500;
  while (true) {
    const response = await pipedriveFetch<{
      data: T[] | null;
      additional_data?: {
        pagination?: { more_items_in_collection: boolean; next_start?: number };
      };
    }>(path, {
      ...opts,
      searchParams: { ...opts.searchParams, start, limit },
    });

    const data = response.data ?? [];
    for (const item of data) yield item;

    const pagination = response.additional_data?.pagination;
    if (!pagination?.more_items_in_collection) break;
    if (typeof pagination.next_start !== "number") break;
    start = pagination.next_start;
  }
}
```

- [ ] **Step 3: Commit**

```
git add lib/crm/errors.ts lib/crm/providers/pipedrive-http.ts
git commit -m "feat(crm): error class and Pipedrive HTTP helper"
```

---

### Task 7: Pipedrive provider implementation

**Files:**
- Create: `lib/crm/providers/pipedrive.ts`

- [ ] **Step 1: Implement**

```ts
// lib/crm/providers/pipedrive.ts
import { env } from "@/lib/env";
import { CrmApiError } from "../errors";
import type {
  CrmProvider,
} from "../provider";
import type {
  ConnectionContext,
  ConnectionTokens,
  CrmCustomField,
  CrmDeal,
  CrmDealStatus,
  CrmPipeline,
  CrmSourceValue,
  CrmStage,
  ExchangeResult,
} from "../types";
import { pipedriveFetch, pipedrivePaginate } from "./pipedrive-http";

const OAUTH_HOST = "https://oauth.pipedrive.com";

type PipedriveTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;     // seconds
  api_domain: string;     // e.g. "company.pipedrive.com"
  scope: string;
  token_type: string;
};

type PipedriveUserMe = {
  data: { id: number; company_id: number; company_domain: string };
};

type PipedrivePipeline = {
  id: number;
  name: string;
  order_nr: number;
  active: boolean;
  deleted_flag?: boolean;
};

type PipedriveStage = {
  id: number;
  name: string;
  order_nr: number;
  pipeline_id: number;
  active_flag: boolean;
  deleted_flag?: boolean;
};

type PipedriveField = {
  key: string;             // hash
  name: string;
  field_type: string;      // "enum", "set", "varchar", ...
  options?: { id: number; label: string }[];
};

type PipedriveChannelOption = { id: number; label: string };

type PipedriveDeal = {
  id: number;
  title: string;
  value: number;
  currency: string;
  status: "open" | "won" | "lost" | "deleted";
  pipeline_id: number;
  stage_id: number;
  channel?: number | null;
  channel_id?: number | null;
  owner_name?: string;
  person_name?: string;
  org_name?: string;
  add_time: string;
  update_time: string;
  won_time?: string | null;
  is_deleted?: boolean;
  [k: string]: unknown;    // for dynamic custom fields
};

function parsePipedriveTimestamp(s: string): Date {
  // Pipedrive returns "YYYY-MM-DD HH:MM:SS" in UTC
  return new Date(s.replace(" ", "T") + "Z");
}

export const pipedriveProvider: CrmProvider = {
  id: "pipedrive",

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.PIPEDRIVE_CLIENT_ID,
      redirect_uri: env.PIPEDRIVE_REDIRECT_URI,
      state,
    });
    return `${OAUTH_HOST}/oauth/authorize?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<ExchangeResult> {
    const basic = Buffer.from(
      `${env.PIPEDRIVE_CLIENT_ID}:${env.PIPEDRIVE_CLIENT_SECRET}`
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.PIPEDRIVE_REDIRECT_URI,
    });

    const res = await fetch(`${OAUTH_HOST}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const tokenResponse = (await res.json()) as PipedriveTokenResponse & {
      error?: string;
      error_description?: string;
    };
    if (!res.ok) {
      throw new CrmApiError(
        res.status,
        "pipedrive",
        tokenResponse.error_description ?? tokenResponse.error ?? "exchange failed",
        tokenResponse
      );
    }

    const me = await pipedriveFetch<PipedriveUserMe>("/v1/users/me", {
      accessToken: tokenResponse.access_token,
      apiDomain: tokenResponse.api_domain,
    });

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      externalUserId: String(me.data.id),
      externalCompanyId: String(me.data.company_id),
      externalCompanyDomain: me.data.company_domain,
      scope: tokenResponse.scope,
    };
  },

  async refreshToken(refreshToken: string): Promise<ConnectionTokens> {
    const basic = Buffer.from(
      `${env.PIPEDRIVE_CLIENT_ID}:${env.PIPEDRIVE_CLIENT_SECRET}`
    ).toString("base64");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const res = await fetch(`${OAUTH_HOST}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const tokenResponse = (await res.json()) as PipedriveTokenResponse & {
      error?: string;
    };
    if (!res.ok) {
      throw new CrmApiError(res.status, "pipedrive", tokenResponse.error ?? "refresh failed", tokenResponse);
    }
    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
    };
  },

  async fetchPipelines(conn: ConnectionContext): Promise<CrmPipeline[]> {
    const res = await pipedriveFetch<{ data: PipedrivePipeline[] | null }>(
      "/v1/pipelines",
      { accessToken: conn.accessToken, apiDomain: conn.apiDomain }
    );
    return (res.data ?? [])
      .filter((p) => p.active && !p.deleted_flag)
      .map((p) => ({ externalId: String(p.id), name: p.name, orderNr: p.order_nr }));
  },

  async fetchStages(conn: ConnectionContext, pipelineExternalId: string): Promise<CrmStage[]> {
    const res = await pipedriveFetch<{ data: PipedriveStage[] | null }>(
      "/v1/stages",
      {
        accessToken: conn.accessToken,
        apiDomain: conn.apiDomain,
        searchParams: { pipeline_id: pipelineExternalId },
      }
    );
    return (res.data ?? [])
      .filter((s) => s.active_flag && !s.deleted_flag)
      .map((s) => ({
        externalId: String(s.id),
        pipelineExternalId: String(s.pipeline_id),
        name: s.name,
        orderNr: s.order_nr,
      }));
  },

  async fetchCustomFields(conn: ConnectionContext): Promise<CrmCustomField[]> {
    const res = await pipedriveFetch<{ data: PipedriveField[] | null }>(
      "/v1/dealFields",
      { accessToken: conn.accessToken, apiDomain: conn.apiDomain }
    );
    return (res.data ?? [])
      .filter((f) => f.field_type === "enum" || f.field_type === "set")
      .map((f) => ({
        key: f.key,
        name: f.name,
        fieldType: f.field_type,
        options: f.options?.map((o) => ({ id: String(o.id), label: o.label })),
      }));
  },

  async fetchSourceCatalog(
    conn: ConnectionContext,
    sourceFieldType: "channel" | "custom",
    sourceFieldKey: string
  ): Promise<CrmSourceValue[]> {
    if (sourceFieldType === "channel") {
      // Pipedrive exposes channels via /v1/dealFields where key = "channel"
      const res = await pipedriveFetch<{ data: PipedriveField[] | null }>(
        "/v1/dealFields",
        { accessToken: conn.accessToken, apiDomain: conn.apiDomain }
      );
      const channel = (res.data ?? []).find((f) => f.key === "channel");
      return (channel?.options ?? []).map((o: PipedriveChannelOption) => ({
        externalId: String(o.id),
        name: o.label,
      }));
    }
    // custom — look up the field by key
    const res = await pipedriveFetch<{ data: PipedriveField[] | null }>(
      "/v1/dealFields",
      { accessToken: conn.accessToken, apiDomain: conn.apiDomain }
    );
    const field = (res.data ?? []).find((f) => f.key === sourceFieldKey);
    return (field?.options ?? []).map((o) => ({
      externalId: String(o.id),
      name: o.label,
    }));
  },

  async *fetchDeals(params): AsyncGenerator<CrmDeal> {
    for (const pipelineId of params.pipelineExternalIds) {
      for (const status of params.statuses) {
        const searchParams: Record<string, string | number> = {
          status,
          pipeline_id: pipelineId,
        };
        // No server-side date filter for add_time; we filter by status+pipeline and handle
        // updated_since via update_time in the loop.
        for await (const d of pipedrivePaginate<PipedriveDeal>("/v1/deals", {
          accessToken: params.conn.accessToken,
          apiDomain: params.conn.apiDomain,
          searchParams,
        })) {
          if (d.is_deleted) continue;
          if (d.status !== "open" && d.status !== "won") continue;
          const updateTime = parsePipedriveTimestamp(d.update_time);
          if (params.updatedSince && updateTime < params.updatedSince) continue;
          // For open deals, enforce stage filter. For won, always include.
          if (d.status === "open" && !params.openStageExternalIds.includes(String(d.stage_id))) {
            continue;
          }
          // Resolve source
          let sourceExternalId: string | null = null;
          if (params.sourceFieldType === "channel") {
            if (d.channel !== undefined && d.channel !== null) sourceExternalId = String(d.channel);
          } else {
            const rawVal = (d as Record<string, unknown>)[params.sourceFieldKey];
            if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
              sourceExternalId = String(rawVal);
            }
          }
          yield {
            externalId: String(d.id),
            title: d.title,
            value: typeof d.value === "number" ? d.value : null,
            currency: d.currency ?? null,
            status: d.status as CrmDealStatus,
            pipelineExternalId: String(d.pipeline_id),
            stageExternalId: String(d.stage_id),
            sourceExternalId,
            ownerName: d.owner_name ?? null,
            personName: d.person_name ?? null,
            orgName: d.org_name ?? null,
            addTime: parsePipedriveTimestamp(d.add_time),
            updateTime,
            wonTime: d.won_time ? parsePipedriveTimestamp(d.won_time) : null,
            rawData: d as Record<string, unknown>,
          };
        }
      }
    }
  },

  async fetchLostOrDeletedIdsSince(
    conn: ConnectionContext,
    updatedSince: Date
  ): Promise<string[]> {
    // Pipedrive doesn't have a single "changed since" endpoint for deals that filters by status.
    // We fetch status=lost and filter by update_time on the client side, plus separately handle
    // deleted deals (is_deleted flag returned on normal list queries elsewhere).
    const ids: string[] = [];
    for await (const d of pipedrivePaginate<PipedriveDeal>("/v1/deals", {
      accessToken: conn.accessToken,
      apiDomain: conn.apiDomain,
      searchParams: { status: "lost" },
    })) {
      const updateTime = parsePipedriveTimestamp(d.update_time);
      if (updateTime >= updatedSince) ids.push(String(d.id));
    }
    return ids;
  },
};
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`. The `provider.ts` from Task 5 should now resolve its import. Expected: exit 0.

- [ ] **Step 3: Commit (includes Task 5 + Task 7)**

```
git add lib/crm/provider.ts lib/crm/providers/pipedrive.ts
git commit -m "feat(crm): CrmProvider interface + Pipedrive implementation"
```

---

## Phase 3 — OAuth flow

### Task 8: State JWT helpers

**Files:**
- Create: `lib/crm/oauth.ts`

- [ ] **Step 1: Write helpers**

```ts
// lib/crm/oauth.ts
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";

const STATE_ALG = "HS256";
const STATE_EXPIRY = "10m";

export interface CrmOAuthState {
  accountId: string;
  workspaceId: string;
  userId: string;
  provider: string;
  nonce: string;
}

function getKey(): Uint8Array {
  return new TextEncoder().encode(env.CRM_STATE_SECRET);
}

export async function signOAuthState(
  state: Omit<CrmOAuthState, "nonce">
): Promise<string> {
  return new SignJWT({ ...state, nonce: randomUUID() })
    .setProtectedHeader({ alg: STATE_ALG })
    .setIssuedAt()
    .setExpirationTime(STATE_EXPIRY)
    .sign(getKey());
}

export async function verifyOAuthState(token: string): Promise<CrmOAuthState> {
  const { payload } = await jwtVerify(token, getKey(), { algorithms: [STATE_ALG] });
  const { accountId, workspaceId, userId, provider, nonce } = payload as Record<
    string,
    unknown
  >;
  if (
    typeof accountId !== "string" ||
    typeof workspaceId !== "string" ||
    typeof userId !== "string" ||
    typeof provider !== "string" ||
    typeof nonce !== "string"
  ) {
    throw new Error("Invalid state payload");
  }
  return { accountId, workspaceId, userId, provider, nonce };
}
```

Note: `jose` is already a transitive dep via `@supabase/ssr`. If type-check complains about missing `jose`, add it explicitly: `npm install jose`.

- [ ] **Step 2: Type-check + commit**

```
npm run type-check
git add lib/crm/oauth.ts
git commit -m "feat(crm): OAuth state JWT helpers"
```

---

### Task 9: OAuth login + callback routes

**Files:**
- Create: `app/api/auth/crm/[provider]/login/route.ts`
- Create: `app/api/auth/crm/[provider]/callback/route.ts`

- [ ] **Step 1: Login route**

```ts
// app/api/auth/crm/[provider]/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getProvider } from "@/lib/crm/provider";
import { signOAuthState } from "@/lib/crm/oauth";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { provider: providerId } = await params;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "missing accountId" }, { status: 400 });

  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return NextResponse.json({ error: "no workspace" }, { status: 403 });

  const acc = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (acc.length === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }

  const state = await signOAuthState({
    accountId,
    workspaceId: workspace.id,
    userId,
    provider: provider.id,
  });
  return NextResponse.redirect(provider.getAuthUrl(state));
}
```

- [ ] **Step 2: Callback route**

```ts
// app/api/auth/crm/[provider]/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { env } from "@/lib/env";
import { getProvider } from "@/lib/crm/provider";
import { verifyOAuthState } from "@/lib/crm/oauth";
import { fetchAndUpsertCatalogs } from "@/lib/crm/sync";
import { CrmApiError } from "@/lib/crm/errors";

interface Params {
  params: Promise<{ provider: string }>;
}

function redirect(pathAndQuery: string) {
  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}${pathAndQuery}`);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { provider: providerId } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError === "access_denied") {
    return redirect(`/app/settings/integrations?error=denied`);
  }
  if (!code || !stateRaw) {
    return redirect(`/app/settings/integrations?error=invalid_state`);
  }

  let state;
  try {
    state = await verifyOAuthState(stateRaw);
  } catch {
    return redirect(`/app/settings/integrations?error=invalid_state`);
  }

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return redirect(`/app/settings/integrations?error=unknown_provider`);
  }

  let exchange;
  try {
    exchange = await provider.exchangeCode(code);
  } catch (err) {
    console.error("[crm-callback] exchange failed", err);
    return redirect(`/app/settings/integrations?error=exchange_failed`);
  }

  const domain = exchange.externalCompanyDomain
    ? `${exchange.externalCompanyDomain}.pipedrive.com`
    : null;

  // Upsert connection (one per account + provider)
  const existing = await db
    .select({ id: crmConnections.id })
    .from(crmConnections)
    .where(
      and(
        eq(crmConnections.accountId, state.accountId),
        eq(crmConnections.provider, provider.id)
      )
    )
    .limit(1);

  let connectionId: string;
  const values = {
    workspaceId: state.workspaceId,
    accountId: state.accountId,
    provider: provider.id,
    externalUserId: exchange.externalUserId,
    externalCompanyId: exchange.externalCompanyId,
    externalCompanyDomain: domain,
    accessToken: exchange.accessToken,
    refreshToken: exchange.refreshToken,
    tokenExpiresAt: exchange.expiresAt,
    status: "active",
    scope: exchange.scope,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(crmConnections)
      .set(values)
      .where(eq(crmConnections.id, existing[0].id));
    connectionId = existing[0].id;
  } else {
    const inserted = await db
      .insert(crmConnections)
      .values(values)
      .returning({ id: crmConnections.id });
    connectionId = inserted[0].id;
  }

  // Seed catalogs — best effort; if this fails we still redirect to setup and the user sees an error banner there
  try {
    await fetchAndUpsertCatalogs(connectionId);
  } catch (err) {
    if (err instanceof CrmApiError && err.isAuthError()) {
      await db
        .update(crmConnections)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(crmConnections.id, connectionId));
      return redirect(`/app/settings/integrations?error=scope_insufficient`);
    }
    console.error("[crm-callback] catalog seed failed", err);
    // continue — the mapping page will retry
  }

  return redirect(`/app/accounts/${state.accountId}/crm/setup`);
}
```

- [ ] **Step 3: Commit**

Will fail type-check until Task 10 (`fetchAndUpsertCatalogs`) is written. Hold the commit until Task 10 lands.

---

### Task 10: `lib/crm/sync.ts` — catalogs + deals sync helpers

**Files:**
- Create: `lib/crm/sync.ts`
- Create: `lib/crm/token-refresh.ts`

- [ ] **Step 1: Token refresh wrapper**

```ts
// lib/crm/token-refresh.ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections, type CrmConnection } from "@/lib/drizzle/schema";
import { getProvider } from "./provider";
import { CrmApiError } from "./errors";
import type { ConnectionContext } from "./types";

/**
 * Wrap any provider API call so that 401 → refresh → retry once.
 * Throws the original (or the refresh error) if retry also fails.
 */
export async function withRefresh<T>(
  connection: CrmConnection,
  fn: (ctx: ConnectionContext) => Promise<T>
): Promise<T> {
  const ctx: ConnectionContext = {
    accessToken: connection.accessToken,
    apiDomain: connection.externalCompanyDomain
      ? `${connection.externalCompanyDomain}.pipedrive.com`
      : "api.pipedrive.com",
  };

  try {
    return await fn(ctx);
  } catch (err) {
    if (!(err instanceof CrmApiError) || !err.isAuthError()) throw err;

    // Attempt refresh
    const provider = getProvider(connection.provider);
    let tokens;
    try {
      tokens = await provider.refreshToken(connection.refreshToken);
    } catch (refreshErr) {
      await db
        .update(crmConnections)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(crmConnections.id, connection.id));
      throw refreshErr;
    }

    await db
      .update(crmConnections)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(crmConnections.id, connection.id));

    const newCtx: ConnectionContext = { ...ctx, accessToken: tokens.accessToken };
    return await fn(newCtx);
  }
}

export async function getConnectionOrThrow(connectionId: string): Promise<CrmConnection> {
  const rows = await db
    .select()
    .from(crmConnections)
    .where(eq(crmConnections.id, connectionId))
    .limit(1);
  if (rows.length === 0) throw new Error("connection not found");
  return rows[0];
}
```

- [ ] **Step 2: Sync helpers**

```ts
// lib/crm/sync.ts
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  crmConnections,
  crmPipelines,
  crmStages,
  crmDeals,
  crmSources,
  crmSourceConfig,
  accounts,
} from "@/lib/drizzle/schema";
import { getProvider } from "./provider";
import { getConnectionOrThrow, withRefresh } from "./token-refresh";

/**
 * Refresh pipelines + stages (preserving is_synced). If source_config exists,
 * also refresh crm_sources catalog.
 */
export async function fetchAndUpsertCatalogs(connectionId: string): Promise<void> {
  const connection = await getConnectionOrThrow(connectionId);
  const provider = getProvider(connection.provider);

  const pipelines = await withRefresh(connection, (ctx) => provider.fetchPipelines(ctx));

  // Load existing pipelines to preserve is_synced
  const existingPipelines = await db
    .select({ id: crmPipelines.id, externalId: crmPipelines.externalId, isSynced: crmPipelines.isSynced })
    .from(crmPipelines)
    .where(eq(crmPipelines.connectionId, connectionId));
  const pipelineByExternal = new Map(existingPipelines.map((p) => [p.externalId, p]));

  const pipelineLocalIds = new Map<string, string>(); // externalId -> local uuid

  for (const p of pipelines) {
    const existing = pipelineByExternal.get(p.externalId);
    if (existing) {
      await db
        .update(crmPipelines)
        .set({ name: p.name, updatedAt: new Date() })
        .where(eq(crmPipelines.id, existing.id));
      pipelineLocalIds.set(p.externalId, existing.id);
    } else {
      const inserted = await db
        .insert(crmPipelines)
        .values({ connectionId, externalId: p.externalId, name: p.name, isSynced: false })
        .returning({ id: crmPipelines.id });
      pipelineLocalIds.set(p.externalId, inserted[0].id);
    }
  }

  // Stages (per pipeline)
  for (const [externalId, localId] of pipelineLocalIds.entries()) {
    const stages = await withRefresh(connection, (ctx) =>
      provider.fetchStages(ctx, externalId)
    );
    const existingStages = await db
      .select({ id: crmStages.id, externalId: crmStages.externalId })
      .from(crmStages)
      .where(eq(crmStages.pipelineId, localId));
    const stageByExternal = new Map(existingStages.map((s) => [s.externalId, s]));

    for (const s of stages) {
      const existing = stageByExternal.get(s.externalId);
      if (existing) {
        await db
          .update(crmStages)
          .set({ name: s.name, orderNr: s.orderNr, updatedAt: new Date() })
          .where(eq(crmStages.id, existing.id));
      } else {
        await db
          .insert(crmStages)
          .values({
            pipelineId: localId,
            externalId: s.externalId,
            name: s.name,
            orderNr: s.orderNr,
            isSynced: false,
          });
      }
    }
  }

  // Sources catalog (only if source_config exists)
  const srcCfg = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connectionId))
    .limit(1);
  if (srcCfg.length > 0) {
    const cfg = srcCfg[0];
    const sourceValues = await withRefresh(connection, (ctx) =>
      provider.fetchSourceCatalog(
        ctx,
        cfg.sourceFieldType as "channel" | "custom",
        cfg.sourceFieldKey
      )
    );
    // Wipe + replace — catalog is small and changes are rare
    await db.delete(crmSources).where(eq(crmSources.connectionId, connectionId));
    if (sourceValues.length > 0) {
      await db.insert(crmSources).values(
        sourceValues.map((v) => ({
          connectionId,
          externalId: v.externalId,
          name: v.name,
        }))
      );
    }
  }

  await db
    .update(crmConnections)
    .set({ catalogsLastRefresh: new Date(), updatedAt: new Date() })
    .where(eq(crmConnections.id, connectionId));
}

/**
 * Fetch and upsert deals. If updatedSince is provided, also runs lost-deletion cleanup.
 */
export async function fetchAndUpsertDeals(
  connectionId: string,
  updatedSince: Date | null
): Promise<{ upserted: number; deleted: number }> {
  const connection = await getConnectionOrThrow(connectionId);
  const provider = getProvider(connection.provider);

  const srcCfg = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connectionId))
    .limit(1);
  if (srcCfg.length === 0) {
    // Mapping not complete — skip
    return { upserted: 0, deleted: 0 };
  }
  const cfg = srcCfg[0];

  // Load synced pipelines + stages
  const syncedPipelines = await db
    .select({
      localId: crmPipelines.id,
      externalId: crmPipelines.externalId,
    })
    .from(crmPipelines)
    .where(
      and(eq(crmPipelines.connectionId, connectionId), eq(crmPipelines.isSynced, true))
    );
  if (syncedPipelines.length === 0) return { upserted: 0, deleted: 0 };

  const pipelineIdByExternal = new Map(syncedPipelines.map((p) => [p.externalId, p.localId]));
  const pipelineExternalIds = syncedPipelines.map((p) => p.externalId);

  const syncedStages = await db
    .select({
      localId: crmStages.id,
      externalId: crmStages.externalId,
      pipelineId: crmStages.pipelineId,
    })
    .from(crmStages)
    .where(
      and(
        inArray(
          crmStages.pipelineId,
          syncedPipelines.map((p) => p.localId)
        ),
        eq(crmStages.isSynced, true)
      )
    );
  const stageIdByExternal = new Map<string, string>();
  for (const s of syncedStages) stageIdByExternal.set(s.externalId, s.localId);
  const openStageExternalIds = syncedStages.map((s) => s.externalId);

  // Fetch all stages of synced pipelines (for won-deal stage resolution)
  const allStagesOfSyncedPipelines = await db
    .select({
      localId: crmStages.id,
      externalId: crmStages.externalId,
    })
    .from(crmStages)
    .where(
      inArray(
        crmStages.pipelineId,
        syncedPipelines.map((p) => p.localId)
      )
    );
  const anyStageExternalToLocal = new Map(
    allStagesOfSyncedPipelines.map((s) => [s.externalId, s.localId])
  );

  let upserted = 0;

  for await (const deal of provider.fetchDeals({
    conn: {
      accessToken: connection.accessToken,
      apiDomain: connection.externalCompanyDomain
        ? `${connection.externalCompanyDomain}.pipedrive.com`
        : "api.pipedrive.com",
    },
    pipelineExternalIds,
    openStageExternalIds,
    statuses: ["open", "won"],
    sourceFieldType: cfg.sourceFieldType as "channel" | "custom",
    sourceFieldKey: cfg.sourceFieldKey,
    updatedSince: updatedSince ?? undefined,
  })) {
    const pipelineLocalId = pipelineIdByExternal.get(deal.pipelineExternalId);
    const stageLocalId =
      stageIdByExternal.get(deal.stageExternalId) ??
      anyStageExternalToLocal.get(deal.stageExternalId) ??
      null;
    if (!pipelineLocalId) continue;

    await db
      .insert(crmDeals)
      .values({
        connectionId,
        accountId: connection.accountId,
        externalId: deal.externalId,
        title: deal.title,
        value: deal.value !== null ? String(deal.value) : null,
        currency: deal.currency,
        status: deal.status,
        pipelineId: pipelineLocalId,
        stageId: stageLocalId,
        sourceExternalId: deal.sourceExternalId,
        ownerName: deal.ownerName,
        personName: deal.personName,
        orgName: deal.orgName,
        addTime: deal.addTime,
        updateTime: deal.updateTime,
        wonTime: deal.wonTime,
        rawData: deal.rawData,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [crmDeals.connectionId, crmDeals.externalId],
        set: {
          title: deal.title,
          value: deal.value !== null ? String(deal.value) : null,
          currency: deal.currency,
          status: deal.status,
          pipelineId: pipelineLocalId,
          stageId: stageLocalId,
          sourceExternalId: deal.sourceExternalId,
          ownerName: deal.ownerName,
          personName: deal.personName,
          orgName: deal.orgName,
          updateTime: deal.updateTime,
          wonTime: deal.wonTime,
          rawData: deal.rawData,
          lastSyncedAt: new Date(),
        },
      });
    upserted++;
  }

  // Lost/deleted cleanup (incremental only)
  let deleted = 0;
  if (updatedSince) {
    const lostIds = await withRefresh(connection, (ctx) =>
      provider.fetchLostOrDeletedIdsSince(ctx, updatedSince)
    );
    if (lostIds.length > 0) {
      const result = await db
        .delete(crmDeals)
        .where(
          and(eq(crmDeals.connectionId, connectionId), inArray(crmDeals.externalId, lostIds))
        );
      deleted = lostIds.length;
    }
  }

  return { upserted, deleted };
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`. Expected: exit 0. If `jose` missing, `npm install jose`.

- [ ] **Step 4: Commit (includes Task 9 routes + Task 10 helpers)**

```
git add lib/crm/oauth.ts lib/crm/sync.ts lib/crm/token-refresh.ts \
        app/api/auth/crm/
git commit -m "feat(crm): OAuth routes + sync helpers + token refresh"
```

---

## Phase 4 — Mapping UI + actions + queries

### Task 11: Connection state query

**Files:**
- Create: `lib/queries/crm.ts` (extended further in Task 18)

- [ ] **Step 1: Write initial queries**

```ts
// lib/queries/crm.ts
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  crmConnections,
  crmPipelines,
  crmStages,
  crmSourceConfig,
} from "@/lib/drizzle/schema";

export type CrmConnectionState =
  | { state: "no_connection" }
  | {
      state: "not_configured";
      connection: {
        id: string;
        provider: string;
        externalCompanyDomain: string | null;
        status: "active" | "expired" | "revoked";
      };
    }
  | {
      state: "mapped";
      connection: {
        id: string;
        provider: string;
        externalCompanyDomain: string | null;
        status: "active" | "expired" | "revoked";
        lastSyncedAt: Date | null;
      };
    };

export async function getCrmConnectionState(
  workspaceId: string,
  accountId: string
): Promise<CrmConnectionState> {
  const rows = await db
    .select()
    .from(crmConnections)
    .where(
      and(
        eq(crmConnections.workspaceId, workspaceId),
        eq(crmConnections.accountId, accountId)
      )
    )
    .orderBy(desc(crmConnections.createdAt))
    .limit(1);

  if (rows.length === 0) return { state: "no_connection" };
  const c = rows[0];

  if (c.catalogsConfiguredAt === null) {
    return {
      state: "not_configured",
      connection: {
        id: c.id,
        provider: c.provider,
        externalCompanyDomain: c.externalCompanyDomain,
        status: c.status as "active" | "expired" | "revoked",
      },
    };
  }
  return {
    state: "mapped",
    connection: {
      id: c.id,
      provider: c.provider,
      externalCompanyDomain: c.externalCompanyDomain,
      status: c.status as "active" | "expired" | "revoked",
      lastSyncedAt: c.lastSyncedAt,
    },
  };
}

export interface MappingPageData {
  pipelines: {
    id: string;
    externalId: string;
    name: string;
    isSynced: boolean;
    stages: { id: string; externalId: string; name: string; orderNr: number; isSynced: boolean }[];
  }[];
  sourceConfig: { sourceFieldType: "channel" | "custom"; sourceFieldKey: string } | null;
}

export async function getMappingPageData(connectionId: string): Promise<MappingPageData> {
  const pipelines = await db
    .select({
      id: crmPipelines.id,
      externalId: crmPipelines.externalId,
      name: crmPipelines.name,
      isSynced: crmPipelines.isSynced,
    })
    .from(crmPipelines)
    .where(eq(crmPipelines.connectionId, connectionId));

  const stages = await db
    .select({
      id: crmStages.id,
      pipelineId: crmStages.pipelineId,
      externalId: crmStages.externalId,
      name: crmStages.name,
      orderNr: crmStages.orderNr,
      isSynced: crmStages.isSynced,
    })
    .from(crmStages);

  const cfg = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connectionId))
    .limit(1);

  return {
    pipelines: pipelines.map((p) => ({
      ...p,
      stages: stages
        .filter((s) => s.pipelineId === p.id)
        .sort((a, b) => a.orderNr - b.orderNr)
        .map((s) => ({
          id: s.id,
          externalId: s.externalId,
          name: s.name,
          orderNr: s.orderNr,
          isSynced: s.isSynced,
        })),
    })),
    sourceConfig: cfg.length > 0
      ? { sourceFieldType: cfg[0].sourceFieldType as "channel" | "custom", sourceFieldKey: cfg[0].sourceFieldKey }
      : null,
  };
}
```

- [ ] **Step 2: Type-check + commit**

```
npm run type-check
git add lib/queries/crm.ts
git commit -m "feat(crm): connection state + mapping page queries"
```

---

### Task 12: Server actions — updateCrmMapping + disconnectCrmConnection

**Files:**
- Create: `app/actions/crm.ts`

- [ ] **Step 1: Write actions**

```ts
// app/actions/crm.ts
"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import {
  crmConnections,
  crmPipelines,
  crmStages,
  crmSourceConfig,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";

async function assertConnectionAccess(connectionId: string): Promise<{
  connection: { id: string; accountId: string; workspaceId: string };
}> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");

  const rows = await db
    .select({
      id: crmConnections.id,
      accountId: crmConnections.accountId,
      workspaceId: crmConnections.workspaceId,
    })
    .from(crmConnections)
    .where(
      and(eq(crmConnections.id, connectionId), eq(crmConnections.workspaceId, workspace.id))
    )
    .limit(1);
  if (rows.length === 0) throw new Error("forbidden");
  return { connection: rows[0] };
}

export async function updateCrmMapping(input: {
  connectionId: string;
  syncedPipelineIds: string[];    // local uuids
  syncedStageIds: string[];       // local uuids, subset of stages of synced pipelines
  sourceFieldType: "channel" | "custom";
  sourceFieldKey: string;
}): Promise<{ triggeredBackfill: boolean }> {
  const { connection } = await assertConnectionAccess(input.connectionId);

  // Update pipelines.is_synced
  const allPipelines = await db
    .select({ id: crmPipelines.id, externalId: crmPipelines.externalId })
    .from(crmPipelines)
    .where(eq(crmPipelines.connectionId, connection.id));

  for (const p of allPipelines) {
    await db
      .update(crmPipelines)
      .set({
        isSynced: input.syncedPipelineIds.includes(p.id),
        updatedAt: new Date(),
      })
      .where(eq(crmPipelines.id, p.id));
  }

  // Update stages.is_synced
  const allStages = await db
    .select({ id: crmStages.id, pipelineId: crmStages.pipelineId })
    .from(crmStages)
    .where(
      inArray(
        crmStages.pipelineId,
        allPipelines.map((p) => p.id)
      )
    );
  for (const s of allStages) {
    await db
      .update(crmStages)
      .set({
        isSynced: input.syncedStageIds.includes(s.id),
        updatedAt: new Date(),
      })
      .where(eq(crmStages.id, s.id));
  }

  // Upsert source config
  const existing = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connection.id))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(crmSourceConfig)
      .set({
        sourceFieldType: input.sourceFieldType,
        sourceFieldKey: input.sourceFieldKey,
        updatedAt: new Date(),
      })
      .where(eq(crmSourceConfig.connectionId, connection.id));
  } else {
    await db.insert(crmSourceConfig).values({
      connectionId: connection.id,
      sourceFieldType: input.sourceFieldType,
      sourceFieldKey: input.sourceFieldKey,
    });
  }

  await db
    .update(crmConnections)
    .set({ catalogsConfiguredAt: new Date(), updatedAt: new Date() })
    .where(eq(crmConnections.id, connection.id));

  revalidatePath("/app/settings/integrations");
  revalidatePath(`/app/accounts/${connection.accountId}`);
  revalidatePath(`/app/accounts/${connection.accountId}/crm`);
  revalidatePath(`/app/accounts/${connection.accountId}/crm/setup`);

  const { tasks } = await import("@trigger.dev/sdk/v3");
  const idempotencyKey = `backfill-crm:${connection.id}:${[...input.syncedPipelineIds].sort().join(",")}:${input.sourceFieldKey}`;
  await tasks.trigger(
    "backfill-crm-account",
    { connectionId: connection.id },
    { idempotencyKey, idempotencyKeyTTL: "1h" }
  );

  return { triggeredBackfill: true };
}

export async function disconnectCrmConnection(connectionId: string): Promise<void> {
  const { connection } = await assertConnectionAccess(connectionId);
  await db.delete(crmConnections).where(eq(crmConnections.id, connectionId));
  revalidatePath("/app/settings/integrations");
  revalidatePath(`/app/accounts/${connection.accountId}/crm`);
}
```

- [ ] **Step 2: Type-check + commit**

```
npm run type-check
git add app/actions/crm.ts
git commit -m "feat(crm): server actions for mapping + disconnect"
```

---

### Task 13: Setup page (server component)

**Files:**
- Create: `app/(protected)/app/accounts/[id]/crm/setup/page.tsx`

- [ ] **Step 1: Write page**

```tsx
// app/(protected)/app/accounts/[id]/crm/setup/page.tsx
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getCrmConnectionState, getMappingPageData } from "@/lib/queries/crm";
import { getProvider } from "@/lib/crm/provider";
import { getConnectionOrThrow } from "@/lib/crm/token-refresh";
import { CrmMappingForm } from "@/components/crm-mapping-form";
import type { CrmCustomField } from "@/lib/crm/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CrmSetupPage({ params }: PageProps) {
  const { id: accountId } = await params;
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return notFound();

  const acc = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (acc.length === 0) return notFound();

  const state = await getCrmConnectionState(workspace.id, accountId);
  if (state.state === "no_connection") {
    redirect(`/app/accounts/${accountId}/crm`);
  }

  const connection = await getConnectionOrThrow(state.connection.id);
  const mapping = await getMappingPageData(connection.id);

  // Fetch custom fields live (not cached)
  let customFields: CrmCustomField[] = [];
  try {
    const provider = getProvider(connection.provider);
    customFields = await provider.fetchCustomFields({
      accessToken: connection.accessToken,
      apiDomain: connection.externalCompanyDomain
        ? `${connection.externalCompanyDomain}.pipedrive.com`
        : "api.pipedrive.com",
    });
  } catch (err) {
    console.error("[crm-setup] fetchCustomFields failed", err);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-1">Configurar sincronización CRM</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cliente: {acc[0].name} · Proveedor: {connection.provider}
        {connection.externalCompanyDomain && ` · ${connection.externalCompanyDomain}`}
      </p>
      <CrmMappingForm
        accountId={accountId}
        connectionId={connection.id}
        pipelines={mapping.pipelines}
        customFields={customFields}
        sourceConfig={mapping.sourceConfig}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit (together with Task 14)**

Hold until CrmMappingForm is written.

---

### Task 14: CrmMappingForm client component

**Files:**
- Create: `components/crm-mapping-form.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/crm-mapping-form.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCrmMapping, disconnectCrmConnection } from "@/app/actions/crm";
import type { CrmCustomField } from "@/lib/crm/types";

interface Pipeline {
  id: string;
  externalId: string;
  name: string;
  isSynced: boolean;
  stages: { id: string; externalId: string; name: string; orderNr: number; isSynced: boolean }[];
}

interface Props {
  accountId: string;
  connectionId: string;
  pipelines: Pipeline[];
  customFields: CrmCustomField[];
  sourceConfig: { sourceFieldType: "channel" | "custom"; sourceFieldKey: string } | null;
}

export function CrmMappingForm({
  accountId,
  connectionId,
  pipelines,
  customFields,
  sourceConfig,
}: Props) {
  const router = useRouter();
  const [pipelineIds, setPipelineIds] = useState<Set<string>>(
    new Set(pipelines.filter((p) => p.isSynced).map((p) => p.id))
  );
  const [stageIds, setStageIds] = useState<Set<string>>(
    new Set(pipelines.flatMap((p) => p.stages.filter((s) => s.isSynced).map((s) => s.id)))
  );
  const [sourceFieldType, setSourceFieldType] = useState<"channel" | "custom">(
    sourceConfig?.sourceFieldType ?? "channel"
  );
  const [customFieldKey, setCustomFieldKey] = useState<string>(
    sourceConfig?.sourceFieldType === "custom" ? sourceConfig.sourceFieldKey : customFields[0]?.key ?? ""
  );
  const [isPending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);

  const selectedPipelines = useMemo(
    () => pipelines.filter((p) => pipelineIds.has(p.id)),
    [pipelines, pipelineIds]
  );

  function togglePipeline(id: string) {
    const next = new Set(pipelineIds);
    if (next.has(id)) {
      next.delete(id);
      // Remove its stages from selected too
      const pipeline = pipelines.find((p) => p.id === id);
      if (pipeline) {
        const nextStages = new Set(stageIds);
        pipeline.stages.forEach((s) => nextStages.delete(s.id));
        setStageIds(nextStages);
      }
    } else {
      next.add(id);
    }
    setPipelineIds(next);
  }

  function toggleStage(id: string) {
    const next = new Set(stageIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setStageIds(next);
  }

  function save() {
    startTransition(async () => {
      const sourceFieldKey = sourceFieldType === "channel" ? "channel" : customFieldKey;
      const res = await updateCrmMapping({
        connectionId,
        syncedPipelineIds: Array.from(pipelineIds),
        syncedStageIds: Array.from(stageIds),
        sourceFieldType,
        sourceFieldKey,
      });
      if (res.triggeredBackfill) {
        setSyncing(true);
        setTimeout(() => setSyncing(false), 15000);
      }
      router.refresh();
    });
  }

  async function disconnect() {
    if (!confirm("¿Desconectar CRM? Esto borra todos los deals sincronizados de este cliente.")) return;
    startTransition(async () => {
      await disconnectCrmConnection(connectionId);
      router.push(`/app/accounts/${accountId}/crm`);
    });
  }

  const canSave = pipelineIds.size > 0 && (sourceFieldType === "channel" || customFieldKey !== "");

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Pipelines a sincronizar</h2>
          <button
            type="button"
            onClick={disconnect}
            className="text-xs text-destructive hover:underline"
            disabled={isPending}
          >
            Desconectar
          </button>
        </div>
        <div className="space-y-1">
          {pipelines.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pipelineIds.has(p.id)}
                onChange={() => togglePipeline(p.id)}
                disabled={isPending}
              />
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">
                ({p.stages.length} stages)
              </span>
            </label>
          ))}
        </div>
      </section>

      {selectedPipelines.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-1">Stages a sincronizar</h2>
          <p className="text-xs text-muted-foreground mb-2">
            La selección aplica solo a deals abiertos. Los deals ganados del pipeline seleccionado se traen siempre.
          </p>
          {selectedPipelines.map((p) => (
            <div key={p.id} className="mb-3">
              <div className="text-xs font-medium mb-1">{p.name}</div>
              <div className="space-y-1 pl-4">
                {p.stages.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={stageIds.has(s.id)}
                      onChange={() => toggleStage(s.id)}
                      disabled={isPending}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium mb-2">Campo de fuente</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="sourceFieldType"
              checked={sourceFieldType === "channel"}
              onChange={() => setSourceFieldType("channel")}
              disabled={isPending}
            />
            <span>channel (estándar de Pipedrive)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="sourceFieldType"
              checked={sourceFieldType === "custom"}
              onChange={() => setSourceFieldType("custom")}
              disabled={isPending || customFields.length === 0}
            />
            <span>Custom field:</span>
            <select
              value={customFieldKey}
              onChange={(e) => setCustomFieldKey(e.target.value)}
              disabled={sourceFieldType !== "custom" || isPending}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              {customFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Guardando..." : "Guardar y sincronizar"}
        </button>
        {syncing && (
          <span className="text-xs text-muted-foreground">
            Sincronizando — puede tardar unos minutos; la página se actualizará sola.
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit (includes Task 13)**

```
npm run type-check
git add app/\(protected\)/app/accounts/\[id\]/crm/setup/page.tsx components/crm-mapping-form.tsx
git commit -m "feat(crm): setup page + mapping form"
```

---

## Phase 5 — Sync infrastructure (Trigger.dev tasks)

### Task 15: `backfill-crm-account` task

**Files:**
- Create: `trigger/tasks/backfill-crm-account.ts`

- [ ] **Step 1: Write task**

```ts
// trigger/tasks/backfill-crm-account.ts
import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { fetchAndUpsertCatalogs, fetchAndUpsertDeals } from "@/lib/crm/sync";

export const backfillCrmAccount = task({
  id: "backfill-crm-account",
  retry: { maxAttempts: 2 },
  maxDuration: 1800,
  run: async (payload: { connectionId: string }) => {
    const rows = await db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.id, payload.connectionId))
      .limit(1);
    if (rows.length === 0) throw new AbortTaskRunError("connection not found");
    const connection = rows[0];
    if (connection.status !== "active") {
      logger.warn("skipping backfill — connection not active", {
        connectionId: connection.id,
        status: connection.status,
      });
      return { upserted: 0, deleted: 0, skipped: true };
    }

    await fetchAndUpsertCatalogs(connection.id);
    const { upserted, deleted } = await fetchAndUpsertDeals(connection.id, null);

    await db
      .update(crmConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(crmConnections.id, connection.id));

    logger.info("backfill complete", { connectionId: connection.id, upserted, deleted });
    return { upserted, deleted, skipped: false };
  },
});
```

- [ ] **Step 2: Commit (with other tasks below)**

Hold commit.

---

### Task 16: `sync-single-crm-account` task

**Files:**
- Create: `trigger/tasks/sync-single-crm-account.ts`

- [ ] **Step 1: Write task**

```ts
// trigger/tasks/sync-single-crm-account.ts
import { task, logger } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { fetchAndUpsertCatalogs, fetchAndUpsertDeals } from "@/lib/crm/sync";

export const syncSingleCrmAccount = task({
  id: "sync-single-crm-account",
  retry: { maxAttempts: 3 },
  maxDuration: 300,
  run: async (payload: { connectionId: string }) => {
    const rows = await db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.id, payload.connectionId))
      .limit(1);
    if (rows.length === 0) return { skipped: "not_found" };
    const conn = rows[0];
    if (conn.status !== "active") return { skipped: conn.status };
    if (conn.catalogsConfiguredAt === null) return { skipped: "not_configured" };

    // Refresh catalogs if stale
    const staleHours = 24;
    const staleCutoff = new Date(Date.now() - staleHours * 3600_000);
    if (!conn.catalogsLastRefresh || conn.catalogsLastRefresh < staleCutoff) {
      await fetchAndUpsertCatalogs(conn.id);
    }

    const updatedSince = conn.lastSyncedAt
      ? new Date(conn.lastSyncedAt.getTime() - 5 * 60_000)  // 5-minute overlap
      : new Date(0);   // first incremental run pulls everything (mirrors backfill safety)

    const { upserted, deleted } = await fetchAndUpsertDeals(conn.id, updatedSince);

    await db
      .update(crmConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(crmConnections.id, conn.id));

    logger.info("incremental sync complete", { connectionId: conn.id, upserted, deleted });
    return { upserted, deleted };
  },
});
```

- [ ] **Step 2: Hold commit.**

---

### Task 17: `sync-crm-accounts` fan-out cron

**Files:**
- Create: `trigger/tasks/sync-crm-accounts.ts`

- [ ] **Step 1: Write task**

```ts
// trigger/tasks/sync-crm-accounts.ts
import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { syncSingleCrmAccount } from "./sync-single-crm-account";

export const syncCrmAccounts = schedules.task({
  id: "sync-crm-accounts",
  cron: "5 * * * *",
  run: async () => {
    const rows = await db
      .select({ id: crmConnections.id })
      .from(crmConnections)
      .where(
        and(
          eq(crmConnections.status, "active"),
          isNotNull(crmConnections.catalogsConfiguredAt)
        )
      );

    logger.info(`found ${rows.length} mapped CRM connections`);
    if (rows.length === 0) return { triggered: 0 };

    await syncSingleCrmAccount.batchTrigger(
      rows.map((r) => ({ payload: { connectionId: r.id } }))
    );
    return { triggered: rows.length };
  },
});
```

- [ ] **Step 2: Hold commit.**

---

### Task 18: `refresh-crm-tokens` daily cron

**Files:**
- Create: `trigger/tasks/refresh-crm-tokens.ts`

- [ ] **Step 1: Write task**

```ts
// trigger/tasks/refresh-crm-tokens.ts
import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { crmConnections } from "@/lib/drizzle/schema";
import { getProvider } from "@/lib/crm/provider";
import { CrmApiError } from "@/lib/crm/errors";

export const refreshCrmTokens = schedules.task({
  id: "refresh-crm-tokens",
  cron: "0 4 * * *",
  run: async () => {
    const cutoff = new Date(Date.now() + 6 * 3600_000);
    const rows = await db
      .select()
      .from(crmConnections)
      .where(and(eq(crmConnections.status, "active"), lte(crmConnections.tokenExpiresAt, cutoff)));

    logger.info(`refreshing ${rows.length} CRM tokens`);
    let refreshed = 0;
    let failed = 0;

    for (const c of rows) {
      try {
        const provider = getProvider(c.provider);
        const tokens = await provider.refreshToken(c.refreshToken);
        await db
          .update(crmConnections)
          .set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: tokens.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(crmConnections.id, c.id));
        refreshed++;
      } catch (err) {
        failed++;
        if (err instanceof CrmApiError && err.isAuthError()) {
          await db
            .update(crmConnections)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(crmConnections.id, c.id));
        }
        logger.error("CRM token refresh failed", {
          connectionId: c.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { refreshed, failed };
  },
});
```

- [ ] **Step 2: Type-check + commit all 4 tasks**

```
npm run type-check
git add trigger/tasks/backfill-crm-account.ts \
        trigger/tasks/sync-single-crm-account.ts \
        trigger/tasks/sync-crm-accounts.ts \
        trigger/tasks/refresh-crm-tokens.ts
git commit -m "feat(crm): Trigger.dev tasks for backfill, hourly sync, token refresh"
```

Trigger.dev auto-discovers tasks under `./trigger` (per `trigger.config.ts`) — no registration needed.

---

## Phase 6 — Dashboard

### Task 19: Dashboard queries

**Files:**
- Modify: `lib/queries/crm.ts` (append)

- [ ] **Step 1: Append KPI + breakdown + deals queries**

Append to `lib/queries/crm.ts`:

```ts
import { sql, desc as dDesc, isNotNull, gte, lte, count, between } from "drizzle-orm";
import { crmDeals, crmSources, crmStages, crmPipelines as crmPipelinesT } from "@/lib/drizzle/schema";

export type CurrencyBucket = { currency: string; total: number };

export interface CrmKpis {
  createdCount: number;
  wonCount: number;
  valueOpen: CurrencyBucket[];       // sum(value) where status=open, grouped by currency
  valueWon: CurrencyBucket[];        // sum(value) where status=won AND won_time in period
}

export async function getCrmKpis(
  connectionId: string,
  since: Date,
  until: Date
): Promise<CrmKpis> {
  const [createdRow] = await db
    .select({ c: count() })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        between(crmDeals.addTime, since, until)
      )
    );

  const [wonRow] = await db
    .select({ c: count() })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        eq(crmDeals.status, "won"),
        isNotNull(crmDeals.wonTime),
        gte(crmDeals.wonTime, since),
        lte(crmDeals.wonTime, until)
      )
    );

  const openBuckets = await db
    .select({
      currency: crmDeals.currency,
      total: sql<number>`COALESCE(SUM(${crmDeals.value}),0)::float`,
    })
    .from(crmDeals)
    .where(and(eq(crmDeals.connectionId, connectionId), eq(crmDeals.status, "open")))
    .groupBy(crmDeals.currency);

  const wonBuckets = await db
    .select({
      currency: crmDeals.currency,
      total: sql<number>`COALESCE(SUM(${crmDeals.value}),0)::float`,
    })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        eq(crmDeals.status, "won"),
        isNotNull(crmDeals.wonTime),
        gte(crmDeals.wonTime, since),
        lte(crmDeals.wonTime, until)
      )
    )
    .groupBy(crmDeals.currency);

  const toBucket = (rows: { currency: string | null; total: number }[]): CurrencyBucket[] =>
    rows.filter((r) => r.currency && r.total > 0).map((r) => ({ currency: r.currency!, total: r.total }));

  return {
    createdCount: createdRow.c,
    wonCount: wonRow.c,
    valueOpen: toBucket(openBuckets),
    valueWon: toBucket(wonBuckets),
  };
}

export interface SourceBreakdownRow {
  sourceExternalId: string | null;
  sourceName: string;
  createdCount: number;
  wonCount: number;
  valueOpen: CurrencyBucket[];
  valueWon: CurrencyBucket[];
}

export async function getCrmBreakdownBySource(
  connectionId: string,
  since: Date,
  until: Date
): Promise<SourceBreakdownRow[]> {
  // Fetch deals in period with source_external_id and aggregate in memory.
  // Avoids complex SQL GROUP BY + currency pivot.
  const created = await db
    .select({
      sourceExternalId: crmDeals.sourceExternalId,
      status: crmDeals.status,
      value: crmDeals.value,
      currency: crmDeals.currency,
      wonTime: crmDeals.wonTime,
    })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.connectionId, connectionId),
        between(crmDeals.addTime, since, until)
      )
    );

  const sourcesRows = await db
    .select()
    .from(crmSources)
    .where(eq(crmSources.connectionId, connectionId));
  const sourceNameById = new Map(sourcesRows.map((s) => [s.externalId, s.name]));

  const bucketMap = new Map<string | null, SourceBreakdownRow>();
  const addValue = (arr: CurrencyBucket[], currency: string | null, value: string | null) => {
    if (!currency || !value) return;
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) return;
    const existing = arr.find((b) => b.currency === currency);
    if (existing) existing.total += n;
    else arr.push({ currency, total: n });
  };

  for (const d of created) {
    const key = d.sourceExternalId;
    let row = bucketMap.get(key);
    if (!row) {
      row = {
        sourceExternalId: key,
        sourceName: key ? sourceNameById.get(key) ?? `(id:${key})` : "(sin fuente)",
        createdCount: 0,
        wonCount: 0,
        valueOpen: [],
        valueWon: [],
      };
      bucketMap.set(key, row);
    }
    row.createdCount++;
    if (d.status === "won" && d.wonTime && d.wonTime >= since && d.wonTime <= until) {
      row.wonCount++;
      addValue(row.valueWon, d.currency, d.value);
    }
    if (d.status === "open") addValue(row.valueOpen, d.currency, d.value);
  }

  return Array.from(bucketMap.values()).sort((a, b) => b.createdCount - a.createdCount);
}

export interface CrmDealListRow {
  id: string;
  externalId: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: "open" | "won";
  stageName: string | null;
  sourceName: string;
  ownerName: string | null;
  personName: string | null;
  orgName: string | null;
  addTime: Date;
}

export interface CrmDealFilters {
  since: Date;
  until: Date;
  sourceExternalIds?: string[];   // empty/undefined = all
  stageIds?: string[];
  status?: "open" | "won" | "all";
}

export async function getCrmDeals(
  connectionId: string,
  filters: CrmDealFilters,
  page: number,
  pageSize = 25
): Promise<{ deals: CrmDealListRow[]; totalPages: number }> {
  const conditions = [
    eq(crmDeals.connectionId, connectionId),
    between(crmDeals.addTime, filters.since, filters.until),
  ];
  if (filters.sourceExternalIds && filters.sourceExternalIds.length > 0) {
    conditions.push(inArray(crmDeals.sourceExternalId, filters.sourceExternalIds));
  }
  if (filters.stageIds && filters.stageIds.length > 0) {
    conditions.push(inArray(crmDeals.stageId, filters.stageIds));
  }
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(crmDeals.status, filters.status));
  }

  const whereClause = and(...conditions);

  const [countRow] = await db.select({ c: count() }).from(crmDeals).where(whereClause);
  const totalPages = Math.max(1, Math.ceil(countRow.c / pageSize));

  const rows = await db
    .select({
      id: crmDeals.id,
      externalId: crmDeals.externalId,
      title: crmDeals.title,
      value: crmDeals.value,
      currency: crmDeals.currency,
      status: crmDeals.status,
      stageId: crmDeals.stageId,
      sourceExternalId: crmDeals.sourceExternalId,
      ownerName: crmDeals.ownerName,
      personName: crmDeals.personName,
      orgName: crmDeals.orgName,
      addTime: crmDeals.addTime,
    })
    .from(crmDeals)
    .where(whereClause)
    .orderBy(dDesc(crmDeals.addTime))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const stageRows = await db
    .select({ id: crmStages.id, name: crmStages.name })
    .from(crmStages)
    .innerJoin(crmPipelinesT, eq(crmStages.pipelineId, crmPipelinesT.id))
    .where(eq(crmPipelinesT.connectionId, connectionId));
  const stageNameById = new Map(stageRows.map((s) => [s.id, s.name]));

  const sourceRows = await db
    .select()
    .from(crmSources)
    .where(eq(crmSources.connectionId, connectionId));
  const sourceNameById = new Map(sourceRows.map((s) => [s.externalId, s.name]));

  return {
    deals: rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      title: r.title,
      value: r.value ? parseFloat(r.value) : null,
      currency: r.currency,
      status: r.status as "open" | "won",
      stageName: r.stageId ? stageNameById.get(r.stageId) ?? null : null,
      sourceName: r.sourceExternalId
        ? sourceNameById.get(r.sourceExternalId) ?? `(id:${r.sourceExternalId})`
        : "(sin fuente)",
      ownerName: r.ownerName,
      personName: r.personName,
      orgName: r.orgName,
      addTime: r.addTime,
    })),
    totalPages,
  };
}

export interface CrmFilterOptions {
  sources: { externalId: string; name: string }[];
  stages: { id: string; name: string }[];
}

export async function getCrmFilterOptions(connectionId: string): Promise<CrmFilterOptions> {
  const sources = await db
    .select({ externalId: crmSources.externalId, name: crmSources.name })
    .from(crmSources)
    .where(eq(crmSources.connectionId, connectionId));
  const stages = await db
    .select({ id: crmStages.id, name: crmStages.name })
    .from(crmStages)
    .innerJoin(crmPipelinesT, eq(crmStages.pipelineId, crmPipelinesT.id))
    .where(and(eq(crmPipelinesT.connectionId, connectionId), eq(crmStages.isSynced, true)));
  return { sources, stages };
}
```

- [ ] **Step 2: Type-check + commit**

```
npm run type-check
git add lib/queries/crm.ts
git commit -m "feat(crm): dashboard queries (kpis, breakdown, deals list)"
```

---

### Task 20: Dashboard page

**Files:**
- Create: `app/(protected)/app/accounts/[id]/crm/page.tsx`

- [ ] **Step 1: Write page**

```tsx
// app/(protected)/app/accounts/[id]/crm/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  getCrmConnectionState,
  getCrmKpis,
  getCrmBreakdownBySource,
  getCrmDeals,
  getCrmFilterOptions,
} from "@/lib/queries/crm";
import { CrmDashboard } from "@/components/crm-dashboard";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    preset?: string;
    since?: string;
    until?: string;
    tab?: string;
    page?: string;
    source?: string;
    stage?: string;
    status?: string;
  }>;
}

function resolvePeriod(sp: { preset?: string; since?: string; until?: string }): {
  since: Date;
  until: Date;
  preset: "7" | "30" | "90" | "custom";
} {
  const now = new Date();
  if (sp.since && sp.until) {
    return { since: new Date(sp.since), until: new Date(sp.until), preset: "custom" };
  }
  const preset = (sp.preset === "7" || sp.preset === "90" ? sp.preset : "30") as "7" | "30" | "90";
  const days = parseInt(preset, 10);
  return {
    since: new Date(now.getTime() - days * 86400_000),
    until: now,
    preset,
  };
}

export default async function CrmPage({ params, searchParams }: PageProps) {
  const { id: accountId } = await params;
  const sp = await searchParams;

  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return notFound();

  const acc = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (acc.length === 0) return notFound();

  const state = await getCrmConnectionState(workspace.id, accountId);

  if (state.state === "no_connection") {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold mb-2">CRM — {acc[0].name}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Conectá el CRM de este cliente para sincronizar deals.
        </p>
        <a
          href={`/api/auth/crm/pipedrive/login?accountId=${accountId}`}
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Conectar Pipedrive
        </a>
      </div>
    );
  }

  if (state.state === "not_configured") {
    redirect(`/app/accounts/${accountId}/crm/setup`);
  }

  const { since, until, preset } = resolvePeriod(sp);
  const tab = sp.tab === "deals" ? "deals" : "resumen";
  const page = parseInt(sp.page ?? "1", 10) || 1;
  const status = (sp.status as "open" | "won" | "all") ?? "all";
  const sourceIds = sp.source ? sp.source.split(",").filter(Boolean) : undefined;
  const stageIds = sp.stage ? sp.stage.split(",").filter(Boolean) : undefined;

  const [kpis, breakdown, filterOptions, dealPage] = await Promise.all([
    getCrmKpis(state.connection.id, since, until),
    getCrmBreakdownBySource(state.connection.id, since, until),
    getCrmFilterOptions(state.connection.id),
    getCrmDeals(
      state.connection.id,
      { since, until, sourceExternalIds: sourceIds, stageIds, status },
      page
    ),
  ]);

  return (
    <CrmDashboard
      accountId={accountId}
      accountName={acc[0].name}
      connection={state.connection}
      preset={preset}
      since={since.toISOString().slice(0, 10)}
      until={until.toISOString().slice(0, 10)}
      tab={tab}
      kpis={kpis}
      breakdown={breakdown}
      filterOptions={filterOptions}
      dealPage={dealPage}
      page={page}
      status={status}
      sourceIds={sourceIds ?? []}
      stageIds={stageIds ?? []}
    />
  );
}
```

- [ ] **Step 2: Commit together with Task 21 onwards.**

---

### Task 21: `CrmKpiCards` component

**Files:**
- Create: `components/crm-kpi-cards.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/crm-kpi-cards.tsx
import type { CrmKpis, CurrencyBucket } from "@/lib/queries/crm";

function formatMoneyLike(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-AR")}`;
  }
}

function sortBuckets(buckets: CurrencyBucket[]): CurrencyBucket[] {
  return [...buckets].sort((a, b) => b.total - a.total);
}

function renderBuckets(buckets: CurrencyBucket[]): React.ReactNode {
  if (buckets.length === 0) return <span className="text-muted-foreground">—</span>;
  const sorted = sortBuckets(buckets);
  const [primary, ...rest] = sorted;
  return (
    <div>
      <div className="text-lg font-semibold">{formatMoneyLike(primary.total, primary.currency)}</div>
      {rest.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {rest.map((b) => formatMoneyLike(b.total, b.currency)).join(" · ")}
        </div>
      )}
    </div>
  );
}

export function CrmKpiCards({ kpis }: { kpis: CrmKpis }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Card label="Deals creados" value={<div className="text-lg font-semibold">{kpis.createdCount}</div>} />
      <Card label="Deals ganados" value={<div className="text-lg font-semibold">{kpis.wonCount}</div>} />
      <Card label="Valor abierto" value={renderBuckets(kpis.valueOpen)} />
      <Card label="Valor ganado" value={renderBuckets(kpis.valueWon)} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {value}
    </div>
  );
}
```

- [ ] **Step 2: Hold commit.**

---

### Task 22: `CrmDashboard` wrapper (tabs + period selector)

**Files:**
- Create: `components/crm-dashboard.tsx`

- [ ] **Step 1: Write wrapper**

```tsx
// components/crm-dashboard.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CrmSummaryTab } from "./crm-summary-tab";
import { CrmDealsTab } from "./crm-deals-tab";
import type { CrmKpis, SourceBreakdownRow, CrmDealListRow, CrmFilterOptions } from "@/lib/queries/crm";

interface Props {
  accountId: string;
  accountName: string;
  connection: {
    id: string;
    provider: string;
    externalCompanyDomain: string | null;
    status: "active" | "expired" | "revoked";
    lastSyncedAt: Date | null;
  };
  preset: "7" | "30" | "90" | "custom";
  since: string;     // YYYY-MM-DD
  until: string;
  tab: "resumen" | "deals";
  kpis: CrmKpis;
  breakdown: SourceBreakdownRow[];
  filterOptions: CrmFilterOptions;
  dealPage: { deals: CrmDealListRow[]; totalPages: number };
  page: number;
  status: "open" | "won" | "all";
  sourceIds: string[];
  stageIds: string[];
}

export function CrmDashboard(props: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function setTab(tab: "resumen" | "deals") {
    const next = new URLSearchParams(sp.toString());
    next.set("tab", tab);
    router.push(`?${next.toString()}`);
  }

  function setPreset(preset: "7" | "30" | "90") {
    const next = new URLSearchParams(sp.toString());
    next.set("preset", preset);
    next.delete("since");
    next.delete("until");
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">CRM — {props.accountName}</h1>
          <p className="text-xs text-muted-foreground">
            Conectado a {props.connection.provider}
            {props.connection.externalCompanyDomain && ` · ${props.connection.externalCompanyDomain}`}
            {props.connection.lastSyncedAt && ` · última sync: ${new Date(props.connection.lastSyncedAt).toLocaleString("es-AR")}`}
          </p>
        </div>
        <Link
          href={`/app/accounts/${props.accountId}/crm/setup`}
          className="text-xs text-muted-foreground hover:underline"
        >
          Configurar
        </Link>
      </div>

      {props.connection.status !== "active" && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs">
          La conexión está {props.connection.status}. <Link className="underline" href={`/app/accounts/${props.accountId}/crm/setup`}>Reconectar</Link>.
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex rounded-md border border-border">
          {(["7", "30", "90"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1 text-xs ${props.preset === p ? "bg-accent" : "bg-transparent hover:bg-accent/30"}`}
            >
              {p}d
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {props.since} → {props.until}
        </div>
      </div>

      <div className="flex gap-4 border-b border-border mb-4">
        <TabButton active={props.tab === "resumen"} onClick={() => setTab("resumen")}>
          Resumen
        </TabButton>
        <TabButton active={props.tab === "deals"} onClick={() => setTab("deals")}>
          Deals
        </TabButton>
      </div>

      {props.tab === "resumen" ? (
        <CrmSummaryTab kpis={props.kpis} breakdown={props.breakdown} />
      ) : (
        <CrmDealsTab
          filterOptions={props.filterOptions}
          dealPage={props.dealPage}
          page={props.page}
          status={props.status}
          sourceIds={props.sourceIds}
          stageIds={props.stageIds}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px px-2 py-2 text-sm font-medium border-b-2 ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Hold commit.**

---

### Task 23: `CrmSummaryTab` + `CrmDealsTab` components

**Files:**
- Create: `components/crm-summary-tab.tsx`
- Create: `components/crm-deals-tab.tsx`

- [ ] **Step 1: Summary tab**

```tsx
// components/crm-summary-tab.tsx
import { CrmKpiCards } from "./crm-kpi-cards";
import type { CrmKpis, SourceBreakdownRow, CurrencyBucket } from "@/lib/queries/crm";

function moneyRow(buckets: CurrencyBucket[]): string {
  if (buckets.length === 0) return "—";
  return buckets
    .slice()
    .sort((a, b) => b.total - a.total)
    .map((b) => {
      try {
        return new Intl.NumberFormat("es-AR", { style: "currency", currency: b.currency, maximumFractionDigits: 0 }).format(b.total);
      } catch {
        return `${b.currency} ${b.total.toLocaleString("es-AR")}`;
      }
    })
    .join(" · ");
}

export function CrmSummaryTab({
  kpis,
  breakdown,
}: {
  kpis: CrmKpis;
  breakdown: SourceBreakdownRow[];
}) {
  return (
    <div>
      <CrmKpiCards kpis={kpis} />
      <h2 className="text-sm font-medium mb-2">Breakdown por fuente</h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="py-2 px-3 font-normal">Fuente</th>
              <th className="py-2 px-3 font-normal text-right">Creados</th>
              <th className="py-2 px-3 font-normal text-right">Ganados</th>
              <th className="py-2 px-3 font-normal text-right">Valor abierto</th>
              <th className="py-2 px-3 font-normal text-right">Valor ganado</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 px-3 text-center text-muted-foreground">
                  No hay deals en este período.
                </td>
              </tr>
            ) : (
              breakdown.map((r) => (
                <tr key={r.sourceExternalId ?? "none"} className="border-t border-border">
                  <td className="py-2 px-3 font-medium">{r.sourceName}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.createdCount}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.wonCount}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{moneyRow(r.valueOpen)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{moneyRow(r.valueWon)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Deals tab**

```tsx
// components/crm-deals-tab.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CrmDealListRow, CrmFilterOptions } from "@/lib/queries/crm";

interface Props {
  filterOptions: CrmFilterOptions;
  dealPage: { deals: CrmDealListRow[]; totalPages: number };
  page: number;
  status: "open" | "won" | "all";
  sourceIds: string[];
  stageIds: string[];
}

function fmtValue(value: number | null, currency: string | null): string {
  if (value === null || !currency) return "—";
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("es-AR")}`;
  }
}

export function CrmDealsTab({ filterOptions, dealPage, page, status, sourceIds, stageIds }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(partial: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(partial)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select
          value={status}
          onChange={(e) => update({ status: e.target.value === "all" ? null : e.target.value, page: null })}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        >
          <option value="all">Todos</option>
          <option value="open">Abiertos</option>
          <option value="won">Ganados</option>
        </select>

        <MultiSelect
          label="Fuente"
          options={filterOptions.sources.map((s) => ({ value: s.externalId, label: s.name }))}
          selected={sourceIds}
          onChange={(next) => update({ source: next.join(",") || null, page: null })}
        />

        <MultiSelect
          label="Stage"
          options={filterOptions.stages.map((s) => ({ value: s.id, label: s.name }))}
          selected={stageIds}
          onChange={(next) => update({ stage: next.join(",") || null, page: null })}
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="py-2 px-3 font-normal">Título</th>
              <th className="py-2 px-3 font-normal">Fuente</th>
              <th className="py-2 px-3 font-normal">Stage</th>
              <th className="py-2 px-3 font-normal">Status</th>
              <th className="py-2 px-3 font-normal text-right">Valor</th>
              <th className="py-2 px-3 font-normal">Owner</th>
              <th className="py-2 px-3 font-normal">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {dealPage.deals.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 px-3 text-center text-muted-foreground">
                  No hay deals con estos filtros.
                </td>
              </tr>
            ) : (
              dealPage.deals.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-2 px-3 font-medium">{d.title}</td>
                  <td className="py-2 px-3">{d.sourceName}</td>
                  <td className="py-2 px-3">{d.stageName ?? "—"}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ${
                        d.status === "won" ? "bg-green-500/15 text-green-700" : "bg-blue-500/15 text-blue-700"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtValue(d.value, d.currency)}</td>
                  <td className="py-2 px-3">{d.ownerName ?? "—"}</td>
                  <td className="py-2 px-3">{new Date(d.addTime).toLocaleDateString("es-AR")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-muted-foreground">
          Página {page} de {dealPage.totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => update({ page: String(page - 1) })}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            disabled={page >= dealPage.totalPages}
            onClick={() => update({ page: String(page + 1) })}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next);
  }
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-xs">
        {label} {selected.length > 0 && `(${selected.length})`}
      </summary>
      <div className="absolute z-10 mt-1 max-h-60 w-60 overflow-auto rounded-md border border-border bg-popover p-2 shadow-lg">
        {options.length === 0 && <div className="text-xs text-muted-foreground">Sin opciones</div>}
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 py-0.5 text-xs">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 3: Type-check + commit (all dashboard components + page)**

```
npm run type-check
git add app/\(protected\)/app/accounts/\[id\]/crm/page.tsx \
        components/crm-dashboard.tsx components/crm-kpi-cards.tsx \
        components/crm-summary-tab.tsx components/crm-deals-tab.tsx
git commit -m "feat(crm): dashboard page + tabs components"
```

---

### Task 24: Add CRM section to `/app/settings/integrations`

**Files:**
- Modify: `app/(protected)/app/settings/integrations/page.tsx`

- [ ] **Step 1: Read current file**

Run `cat app/\(protected\)/app/settings/integrations/page.tsx` to see the existing structure. Preserve the Meta section.

- [ ] **Step 2: Append CRM section**

Below the existing Meta Ads section, inside the same main container, add:

```tsx
import { crmConnections } from "@/lib/drizzle/schema";
import { accounts } from "@/lib/drizzle/schema";
// ... existing imports

// After loading workspace + meta data, add:
const crmRows = await db
  .select({
    id: crmConnections.id,
    provider: crmConnections.provider,
    externalCompanyDomain: crmConnections.externalCompanyDomain,
    status: crmConnections.status,
    accountId: crmConnections.accountId,
    accountName: accounts.name,
    catalogsConfiguredAt: crmConnections.catalogsConfiguredAt,
  })
  .from(crmConnections)
  .innerJoin(accounts, eq(crmConnections.accountId, accounts.id))
  .where(eq(crmConnections.workspaceId, workspace.id));
```

In the JSX, after the Meta section, add:

```tsx
<section className="mt-8">
  <h2 className="text-lg font-semibold mb-3">CRM</h2>
  {crmRows.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      Todavía no conectaste ningún CRM. Entrá a la página de un cliente → pestaña CRM → "Conectar".
    </p>
  ) : (
    <div className="rounded-md border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left text-muted-foreground">
            <th className="py-2 px-3 font-normal">Cliente</th>
            <th className="py-2 px-3 font-normal">Proveedor</th>
            <th className="py-2 px-3 font-normal">Instancia</th>
            <th className="py-2 px-3 font-normal">Status</th>
            <th className="py-2 px-3 font-normal">Configurar</th>
          </tr>
        </thead>
        <tbody>
          {crmRows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="py-2 px-3 font-medium">{r.accountName}</td>
              <td className="py-2 px-3">{r.provider}</td>
              <td className="py-2 px-3">{r.externalCompanyDomain ?? "—"}</td>
              <td className="py-2 px-3">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ${
                  r.status === "active"
                    ? "bg-green-500/15 text-green-700"
                    : r.status === "expired"
                    ? "bg-yellow-500/15 text-yellow-700"
                    : "bg-red-500/15 text-red-700"
                }`}>
                  {r.status}
                </span>
              </td>
              <td className="py-2 px-3">
                <Link
                  href={`/app/accounts/${r.accountId}/crm/setup`}
                  className="text-xs underline hover:no-underline"
                >
                  {r.catalogsConfiguredAt ? "Editar" : "Configurar"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>
```

- [ ] **Step 3: Type-check + commit**

```
npm run type-check
git add app/\(protected\)/app/settings/integrations/page.tsx
git commit -m "feat(crm): list CRM connections on integrations page"
```

---

## Phase 7 — Verification

### Task 25: End-to-end manual verification

This is checklist-only; no code to write. Go through each step and verify expected output.

- [ ] **Step 1: Start infra**

```
npm run dev                                  # Next.js on :3000
mcp__trigger__start_dev_server  (if Claude) OR:  npx trigger.dev@latest dev
```

- [ ] **Step 2: Smoke test env**

Hit `http://localhost:3000/app/settings/integrations`. Page should load with an empty "CRM" section.

- [ ] **Step 3: Create a test plani account**

Go to `/app/accounts/new`, create an account for testing (e.g. "CRM Test Client").

- [ ] **Step 4: Connect Pipedrive**

Navigate to `/app/accounts/<id>/crm`. Click "Conectar Pipedrive". Authorize in Pipedrive. Expect redirect to `/app/accounts/<id>/crm/setup`.

- [ ] **Step 5: Verify connection + catalogs in DB**

In Supabase SQL editor (or a throwaway script), run:

```sql
SELECT id, status, external_company_domain, catalogs_last_refresh
FROM crm_connections
WHERE account_id = '<id>';

SELECT COUNT(*) FROM crm_pipelines WHERE connection_id = '<connId>';
SELECT COUNT(*) FROM crm_stages
WHERE pipeline_id IN (SELECT id FROM crm_pipelines WHERE connection_id = '<connId>');
```

Expected: 1 connection row with `status='active'` and `catalogs_last_refresh` not null. Pipelines and stages count match Pipedrive.

- [ ] **Step 6: Complete mapping**

On setup page: check 1 pipeline + 2-3 stages + `channel` source → "Guardar y sincronizar". Toast should show.

- [ ] **Step 7: Verify backfill ran**

In Trigger.dev dashboard: run `backfill-crm-account` should be "Completed" with `upserted > 0`. Or:

```sql
SELECT status, COUNT(*) FROM crm_deals WHERE connection_id = '<connId>' GROUP BY status;
SELECT COUNT(*) FROM crm_sources WHERE connection_id = '<connId>';
```

Expected: rows in both tables.

- [ ] **Step 8: Verify dashboard**

Back to `/app/accounts/<id>/crm`:
- Tab "Resumen": KPIs (created, won, valueOpen, valueWon) reflect the period.
- Breakdown table sorted by creados desc, rows per source.
- Tab "Deals": table renders, filters work, pagination works.
- Switch presets (7/30/90): KPIs update.

- [ ] **Step 9: Test incremental sync**

In Pipedrive, modify a deal (change stage, mark won). Trigger `sync-single-crm-account` manually via Trigger.dev dashboard with `{"connectionId": "<connId>"}`. Expected: change reflected in our DB.

- [ ] **Step 10: Test lost deletion**

In Pipedrive, mark a deal `lost`. Trigger `sync-single-crm-account` again. Expected: that row DELETE'd from `crm_deals`.

- [ ] **Step 11: Test token refresh path**

Manually update `crm_connections.token_expires_at` to a past date:
```sql
UPDATE crm_connections SET token_expires_at = now() - interval '1 day' WHERE id = '<connId>';
```
Trigger `sync-single-crm-account` — the `withRefresh` wrapper should get 401, refresh, retry, and sync should succeed. Verify `token_expires_at` is now in the future.

- [ ] **Step 12: Test disconnect**

On `/crm/setup`, click "Desconectar". Confirm dialog. Expected: redirect to `/crm`, button "Conectar Pipedrive" visible again, DB row + all related rows cascade-deleted.

- [ ] **Step 13: Final checks**

```
npm run type-check
npm run lint
```

Both should exit 0.

- [ ] **Step 14: Commit any lint/typecheck fixes if needed**

---

## Self-Review

I ran the self-review inline. Items verified against the spec:

- [x] Schema: 6 tables present (connections, pipelines, stages, source_config, sources, deals). Matches spec.
- [x] Provider abstraction + factory (Task 5) matches spec types.
- [x] Pipedrive impl (Task 7) covers OAuth + pipelines + stages + customFields + sourceCatalog + deals + lost detection.
- [x] OAuth login + callback routes (Task 9) with state JWT verification.
- [x] Token refresh: reactive (`withRefresh`) + proactive daily cron (Task 18).
- [x] Mapping UI (Tasks 13-14): per-pipeline + per-stage selection with the flagged semantics (stages filter open deals only; won always included).
- [x] Server actions: updateCrmMapping with idempotency key, disconnectCrmConnection with cascade.
- [x] Sync tasks: backfill, hourly fan-out, single-account incremental, token refresh cron.
- [x] Dashboard: `/crm` page with tabs, period selector, KPI cards, breakdown, deals table, multi-select filters, pagination.
- [x] Multi-currency: grouped by currency in KPIs and breakdown.
- [x] Settings/integrations list of CRM connections (Task 24).
- [x] Env vars: `CRM_STATE_SECRET` + 3 Pipedrive vars, all in Zod schema.
- [x] Verification plan: 14 manual steps end-to-end.

Deferred items confirmed out of scope per spec: HubSpot/Kommo/Dynamics providers, win rate, FX normalization, custom property picker, webhooks, activities, person/org tables, period comparison, trend chart.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-crm-integration-pipedrive.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
