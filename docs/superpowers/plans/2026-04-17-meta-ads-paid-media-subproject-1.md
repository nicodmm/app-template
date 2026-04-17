# Meta Ads / Paid Media Module — Sub-Project 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP of the Paid Media module: a workspace-level Meta Ads OAuth connection, hourly sync of campaign-level insights, a mini-card on each account page, and a dedicated dashboard at `/app/accounts/[id]/paid-media`.

**Architecture:** Next.js 15 App Router + Supabase Auth + Drizzle ORM + Trigger.dev v4. Meta Graph API v19.0 is the data source. OAuth 2.0 authorization code flow terminates at `/api/auth/meta/callback`, which exchanges for a short-lived token then a long-lived token and persists it in `meta_connections`. A scheduled Trigger.dev task (`sync-meta-ads`) fans out hourly, fetching campaigns + daily insights per mapped ad account and upserting into `meta_campaigns` / `meta_insights_daily`. UI reads aggregates via `lib/queries/paid-media.ts`.

**Tech Stack:** Next.js 15, React 19, Drizzle ORM + Postgres (Supabase), Trigger.dev v4, Meta Graph API v19.0, recharts (new dep), TypeScript strict.

**Spec reference:** `docs/superpowers/specs/2026-04-17-meta-ads-paid-media-subproject-1-design.md`

**Testing note:** This codebase has no test infrastructure. Each task includes manual verification steps (typecheck + runtime probes) instead of automated tests. Do NOT introduce Jest/Vitest as part of this plan — that's out of scope.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `lib/drizzle/schema/meta_connections.ts` | Drizzle schema for workspace-level OAuth connections |
| `lib/drizzle/schema/meta_ad_accounts.ts` | Ad accounts discovered through a connection |
| `lib/drizzle/schema/meta_campaigns.ts` | Campaign snapshot per ad account |
| `lib/drizzle/schema/meta_insights_daily.ts` | Daily campaign metrics |
| `drizzle/migrations/0005_<name>.sql` + `down.sql` | DB migration |
| `lib/meta/client.ts` | Typed Graph API fetch wrapper with error-code handling |
| `lib/meta/oauth.ts` | Token exchange helpers (code → short-lived → long-lived, refresh) |
| `lib/meta/sync-insights.ts` | Pure helpers: parse Meta `actions[]`, upsert campaigns + insights |
| `app/api/auth/meta/login/route.ts` | Starts the OAuth flow, generates state |
| `app/api/auth/meta/callback/route.ts` | Handles the OAuth callback, persists connection |
| `app/actions/meta-connections.ts` | Server actions: disconnect, update ad-account mapping |
| `app/(protected)/app/settings/integrations/page.tsx` | Settings page to map ad accounts to plani.fyi accounts |
| `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx` | Dedicated dashboard |
| `trigger/tasks/sync-meta-ads.ts` | Scheduled cron (hourly) — fans out to sync-single-ad-account |
| `trigger/tasks/sync-single-ad-account.ts` | Per-ad-account sync task |
| `trigger/tasks/backfill-meta-ads.ts` | One-shot 90-day backfill |
| `trigger/tasks/refresh-meta-tokens.ts` | Daily cron — refresh long-lived tokens |
| `lib/queries/paid-media.ts` | Aggregated KPI queries with period + comparison params |
| `components/paid-media-kpi-card.tsx` | Single KPI card with value + delta |
| `components/paid-media-period-selector.tsx` | Preset + custom-range date selector (client) |
| `components/paid-media-mini-card.tsx` | Account-page mini-card (client wrapper + server query) |
| `components/paid-media-campaigns-table.tsx` | Sortable/filterable campaigns table (client) |
| `components/paid-media-campaign-drawer.tsx` | Drawer with 30-day trend chart (client, recharts) |
| `components/paid-media-reconnect-banner.tsx` | Banner shown when token expired |
| `components/ad-account-mapping-form.tsx` | Form for mapping ad account → plani.fyi account |

### Modified files

| File | Change |
|---|---|
| `lib/env.ts` | Add `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` |
| `lib/drizzle/schema/index.ts` | Export new schemas |
| `app/(protected)/app/accounts/[accountId]/page.tsx` | Mount `PaidMediaMiniCard` |
| `package.json` | Add `recharts` |
| `trigger.config.ts` | Register new scheduled tasks (if tasks auto-discover, no change needed) |

---

## Task 1 — Add Meta env vars

**Files:**
- Modify: `lib/env.ts`
- Modify: `.env.local` (user action — already done per conversation)

- [ ] **Step 1: Add the three Meta env vars to the schema**

Replace the entire contents of `lib/env.ts` with:

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
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
```

- [ ] **Step 2: Verify `.env.local` has the three vars**

Ask the user to confirm that `.env.local` contains:

```
META_APP_ID=...
META_APP_SECRET=...
META_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/meta/callback
```

If any is missing, do NOT proceed — the app will fail to boot without them.

- [ ] **Step 3: Typecheck**

Run: `npm run type-check`
Expected: exits cleanly.

- [ ] **Step 4: Commit**

```bash
git add lib/env.ts
git commit -m "feat(meta): add Meta Ads env var schema"
```

---

## Task 2 — Schema: `meta_connections`

**Files:**
- Create: `lib/drizzle/schema/meta_connections.ts`
- Modify: `lib/drizzle/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```ts
// lib/drizzle/schema/meta_connections.ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const metaConnections = pgTable(
  "meta_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    metaUserId: text("meta_user_id").notNull(),
    metaUserName: text("meta_user_name"),
    accessToken: text("access_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at"),
    scopes: text("scopes"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meta_connections_workspace_idx").on(table.workspaceId),
    index("meta_connections_status_idx").on(table.status),
  ]
);

export type MetaConnection = typeof metaConnections.$inferSelect;
export type NewMetaConnection = typeof metaConnections.$inferInsert;
```

- [ ] **Step 2: Add export to the schema index**

Append to `lib/drizzle/schema/index.ts`:

```ts
export * from "./meta_connections";
```

---

## Task 3 — Schema: `meta_ad_accounts`

**Files:**
- Create: `lib/drizzle/schema/meta_ad_accounts.ts`
- Modify: `lib/drizzle/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```ts
// lib/drizzle/schema/meta_ad_accounts.ts
import { pgTable, text, timestamp, uuid, integer, boolean, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { accounts } from "./accounts";
import { metaConnections } from "./meta_connections";

export const metaAdAccounts = pgTable(
  "meta_ad_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => metaConnections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    metaAdAccountId: text("meta_ad_account_id").notNull(),
    metaBusinessId: text("meta_business_id"),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("USD"),
    timezone: text("timezone").notNull().default("UTC"),
    status: integer("status").notNull().default(1),
    isEcommerce: boolean("is_ecommerce").notNull().default(false),
    conversionEvent: text("conversion_event").notNull().default("lead"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meta_ad_accounts_workspace_idx").on(table.workspaceId),
    index("meta_ad_accounts_connection_idx").on(table.connectionId),
    index("meta_ad_accounts_account_idx").on(table.accountId),
    index("meta_ad_accounts_unique_idx").on(table.connectionId, table.metaAdAccountId),
  ]
);

export type MetaAdAccount = typeof metaAdAccounts.$inferSelect;
export type NewMetaAdAccount = typeof metaAdAccounts.$inferInsert;
```

- [ ] **Step 2: Add export**

Append to `lib/drizzle/schema/index.ts`:

```ts
export * from "./meta_ad_accounts";
```

---

## Task 4 — Schema: `meta_campaigns`

**Files:**
- Create: `lib/drizzle/schema/meta_campaigns.ts`
- Modify: `lib/drizzle/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```ts
// lib/drizzle/schema/meta_campaigns.ts
import { pgTable, text, timestamp, uuid, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";

export const metaCampaigns = pgTable(
  "meta_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    metaCampaignId: text("meta_campaign_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    objective: text("objective"),
    dailyBudget: integer("daily_budget"),
    lifetimeBudget: integer("lifetime_budget"),
    startTime: timestamp("start_time"),
    stopTime: timestamp("stop_time"),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meta_campaigns_ad_account_idx").on(table.adAccountId),
    uniqueIndex("meta_campaigns_unique_idx").on(table.adAccountId, table.metaCampaignId),
  ]
);

export type MetaCampaign = typeof metaCampaigns.$inferSelect;
export type NewMetaCampaign = typeof metaCampaigns.$inferInsert;
```

- [ ] **Step 2: Add export**

Append to `lib/drizzle/schema/index.ts`:

```ts
export * from "./meta_campaigns";
```

---

## Task 5 — Schema: `meta_insights_daily`

**Files:**
- Create: `lib/drizzle/schema/meta_insights_daily.ts`
- Modify: `lib/drizzle/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```ts
// lib/drizzle/schema/meta_insights_daily.ts
import { pgTable, text, timestamp, uuid, integer, date, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";
import { metaCampaigns } from "./meta_campaigns";

export const metaInsightsDaily = pgTable(
  "meta_insights_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => metaCampaigns.id, {
      onDelete: "cascade",
    }),
    date: date("date").notNull(),
    spend: integer("spend").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    conversions: integer("conversions").notNull().default(0),
    conversionValue: integer("conversion_value"),
    frequency: numeric("frequency", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_insights_daily_unique_idx").on(
      table.adAccountId,
      table.campaignId,
      table.date
    ),
    index("meta_insights_daily_ad_account_date_idx").on(table.adAccountId, table.date),
  ]
);

export type MetaInsightDaily = typeof metaInsightsDaily.$inferSelect;
export type NewMetaInsightDaily = typeof metaInsightsDaily.$inferInsert;
```

- [ ] **Step 2: Add export**

Append to `lib/drizzle/schema/index.ts`:

```ts
export * from "./meta_insights_daily";
```

- [ ] **Step 3: Typecheck**

Run: `npm run type-check`
Expected: exits cleanly.

- [ ] **Step 4: Commit all schema files**

```bash
git add lib/drizzle/schema/meta_connections.ts lib/drizzle/schema/meta_ad_accounts.ts lib/drizzle/schema/meta_campaigns.ts lib/drizzle/schema/meta_insights_daily.ts lib/drizzle/schema/index.ts
git commit -m "feat(meta): add Meta Ads schema (connections, ad_accounts, campaigns, insights_daily)"
```

---

## Task 6 — Generate & run migration

**Files:**
- Create: `drizzle/migrations/0005_<name>.sql` (generated)
- Create: `drizzle/migrations/0005_<name>/down.sql` (manual)

- [ ] **Step 1: Generate the migration**

Run: `npm run db:generate`
Expected: prints `[✓] Your SQL migration file ➜ drizzle\migrations\0005_<some_name>.sql`. Note the exact folder name — you'll need it for the down migration.

- [ ] **Step 2: Read the generated SQL**

Read the generated file and verify it creates all four tables, foreign keys to `workspaces`, `users`, `accounts`, and the unique indexes on `(connection_id, meta_ad_account_id)`, `(ad_account_id, meta_campaign_id)`, `(ad_account_id, campaign_id, date)`.

- [ ] **Step 3: Create the down migration**

Replace `<name>` below with the exact folder name generated in step 1.

```bash
mkdir -p drizzle/migrations/0005_<name>
```

Create `drizzle/migrations/0005_<name>/down.sql`:

```sql
DROP TABLE IF EXISTS "meta_insights_daily" CASCADE;
DROP TABLE IF EXISTS "meta_campaigns" CASCADE;
DROP TABLE IF EXISTS "meta_ad_accounts" CASCADE;
DROP TABLE IF EXISTS "meta_connections" CASCADE;
```

- [ ] **Step 4: Run the migration**

Run: `npm run db:migrate`
Expected: prints `Migrations complete` without errors.

- [ ] **Step 5: Verify tables in DB**

Run (psql via Supabase dashboard or `psql $DATABASE_URL`):

```sql
\dt meta_*
```

Expected: lists `meta_ad_accounts`, `meta_campaigns`, `meta_connections`, `meta_insights_daily`.

- [ ] **Step 6: Commit**

```bash
git add drizzle/migrations/0005_<name>.sql drizzle/migrations/0005_<name>/down.sql drizzle/migrations/meta/
git commit -m "feat(meta): migration for Meta Ads tables"
```

---

## Task 7 — Graph API client (`lib/meta/client.ts`)

**Files:**
- Create: `lib/meta/client.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/meta/client.ts
const GRAPH_API_VERSION = "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type MetaGraphError = {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaApiError extends Error {
  constructor(
    public code: number,
    public subcode: number | undefined,
    message: string,
    public raw?: unknown
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  /** true when the token is invalid/expired and the connection should be marked expired */
  isAuthError(): boolean {
    if (this.code !== 190) return false;
    // 460 = session invalidated, 463 = expired, 467 = invalid token, 458 = app not installed
    return true;
  }

  /** true when we should back off and retry */
  isRateLimit(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 613 || this.code === 80004;
  }
}

type FetchOptions = {
  accessToken: string;
  searchParams?: Record<string, string | number | undefined>;
};

export async function metaGraphFetch<T>(path: string, opts: FetchOptions): Promise<T> {
  const params = new URLSearchParams();
  params.set("access_token", opts.accessToken);
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
  }
  const url = `${GRAPH_BASE}${path.startsWith("/") ? path : `/${path}`}?${params.toString()}`;

  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new MetaApiError(0, undefined, `Non-JSON response from Meta (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = (json as { error?: MetaGraphError }).error;
    if (err) {
      throw new MetaApiError(err.code ?? 0, err.error_subcode, err.message, err);
    }
    throw new MetaApiError(res.status, undefined, `HTTP ${res.status} from Meta`, json);
  }

  return json as T;
}

export type PagedResponse<T> = {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
};

/** Iterate through all pages for a Graph API endpoint. */
export async function* paginate<T>(
  path: string,
  opts: FetchOptions
): AsyncGenerator<T, void, void> {
  let nextUrl: string | undefined;
  let first = true;
  while (first || nextUrl) {
    const result: PagedResponse<T> = first
      ? await metaGraphFetch<PagedResponse<T>>(path, opts)
      : // Meta's `next` is a full URL already including token/params
        await (async () => {
          const res = await fetch(nextUrl!);
          const json = (await res.json()) as PagedResponse<T>;
          if (!res.ok) {
            const err = (json as unknown as { error?: MetaGraphError }).error;
            throw new MetaApiError(err?.code ?? 0, err?.error_subcode, err?.message ?? "paginate error", json);
          }
          return json;
        })();
    first = false;
    for (const item of result.data) yield item;
    nextUrl = result.paging?.next;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run type-check`
Expected: exits cleanly.

- [ ] **Step 3: Commit**

```bash
git add lib/meta/client.ts
git commit -m "feat(meta): add Graph API fetch wrapper with error classes"
```

---

## Task 8 — OAuth token helpers (`lib/meta/oauth.ts`)

**Files:**
- Create: `lib/meta/oauth.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/meta/oauth.ts
import { env } from "@/lib/env";
import { metaGraphFetch } from "./client";

const SCOPES = ["ads_read", "business_management"] as const;

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: env.META_OAUTH_REDIRECT_URI,
    state,
    scope: SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number; // seconds
};

export async function exchangeCodeForShortToken(code: string): Promise<TokenResponse> {
  return metaGraphFetch<TokenResponse>("/oauth/access_token", {
    accessToken: "",
    searchParams: {
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      redirect_uri: env.META_OAUTH_REDIRECT_URI,
      code,
    },
  });
}

export async function exchangeShortForLongToken(shortToken: string): Promise<TokenResponse> {
  return metaGraphFetch<TokenResponse>("/oauth/access_token", {
    accessToken: "",
    searchParams: {
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  });
}

/** Returns a Date for when the token expires, or null if the API didn't return expires_in. */
export function tokenExpiryDate(tokenResp: TokenResponse): Date | null {
  if (!tokenResp.expires_in) return null;
  return new Date(Date.now() + tokenResp.expires_in * 1000);
}

export async function fetchMe(accessToken: string): Promise<{ id: string; name: string }> {
  return metaGraphFetch<{ id: string; name: string }>("/me", {
    accessToken,
    searchParams: { fields: "id,name" },
  });
}

export type MetaAdAccountFromApi = {
  id: string; // e.g. "act_1234567890"
  account_id: string; // numeric id
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  business?: { id: string; name: string };
};

export async function fetchMyAdAccounts(accessToken: string): Promise<MetaAdAccountFromApi[]> {
  const result = await metaGraphFetch<{ data: MetaAdAccountFromApi[] }>("/me/adaccounts", {
    accessToken,
    searchParams: {
      fields: "id,account_id,name,currency,timezone_name,account_status,business",
      limit: 100,
    },
  });
  return result.data;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run type-check` — expect clean.

```bash
git add lib/meta/oauth.ts
git commit -m "feat(meta): add OAuth token exchange helpers"
```

---

## Task 9 — OAuth login route

**Files:**
- Create: `app/api/auth/meta/login/route.ts`

- [ ] **Step 1: Create the file**

```ts
// app/api/auth/meta/login/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireUserId } from "@/lib/auth";
import { buildAuthorizeUrl } from "@/lib/meta/oauth";

const STATE_COOKIE = "meta_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 minutes

export async function GET() {
  // Must be authenticated to start OAuth
  await requireUserId();

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  const url = buildAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Manual verification**

Start dev server: `npm run dev`.
With an authenticated browser session, navigate to `http://localhost:3000/api/auth/meta/login`.
Expected: the browser redirects to `https://www.facebook.com/v19.0/dialog/oauth?...`.
Inspect cookies: `meta_oauth_state` should be set.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/meta/login/route.ts
git commit -m "feat(meta): add OAuth login route"
```

---

## Task 10 — OAuth callback route

**Files:**
- Create: `app/api/auth/meta/callback/route.ts`

- [ ] **Step 1: Create the file**

```ts
// app/api/auth/meta/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaConnections, metaAdAccounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import {
  exchangeCodeForShortToken,
  exchangeShortForLongToken,
  tokenExpiryDate,
  fetchMe,
  fetchMyAdAccounts,
} from "@/lib/meta/oauth";
import { MetaApiError } from "@/lib/meta/client";

const STATE_COOKIE = "meta_oauth_state";

function errorRedirect(reason: string): NextResponse {
  const url = new URL("/app/settings/integrations", process.env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return errorRedirect("no_workspace");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const metaError = req.nextUrl.searchParams.get("error");

  if (metaError) return errorRedirect(metaError);
  if (!code || !state) return errorRedirect("missing_code_or_state");

  // Validate state against cookie (CSRF)
  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  if (!storedState || storedState !== state) return errorRedirect("invalid_state");

  try {
    // 1. code → short-lived
    const shortToken = await exchangeCodeForShortToken(code);

    // 2. short-lived → long-lived
    const longToken = await exchangeShortForLongToken(shortToken.access_token);

    // 3. /me for display info
    const me = await fetchMe(longToken.access_token);

    // 4. persist connection (upsert: one active per meta_user per workspace)
    const existing = await db
      .select()
      .from(metaConnections)
      .where(
        and(
          eq(metaConnections.workspaceId, workspace.id),
          eq(metaConnections.metaUserId, me.id)
        )
      )
      .limit(1);

    let connectionId: string;
    if (existing.length > 0) {
      connectionId = existing[0].id;
      await db
        .update(metaConnections)
        .set({
          accessToken: longToken.access_token,
          tokenExpiresAt: tokenExpiryDate(longToken),
          scopes: "ads_read,business_management",
          status: "active",
          connectedByUserId: userId,
          metaUserName: me.name,
          updatedAt: new Date(),
        })
        .where(eq(metaConnections.id, connectionId));
    } else {
      const inserted = await db
        .insert(metaConnections)
        .values({
          workspaceId: workspace.id,
          connectedByUserId: userId,
          metaUserId: me.id,
          metaUserName: me.name,
          accessToken: longToken.access_token,
          tokenExpiresAt: tokenExpiryDate(longToken),
          scopes: "ads_read,business_management",
          status: "active",
        })
        .returning({ id: metaConnections.id });
      connectionId = inserted[0].id;
    }

    // 5. fetch ad accounts, upsert into meta_ad_accounts
    const adAccounts = await fetchMyAdAccounts(longToken.access_token);
    for (const aa of adAccounts) {
      const existingAa = await db
        .select({ id: metaAdAccounts.id })
        .from(metaAdAccounts)
        .where(
          and(
            eq(metaAdAccounts.connectionId, connectionId),
            eq(metaAdAccounts.metaAdAccountId, aa.id)
          )
        )
        .limit(1);

      if (existingAa.length > 0) {
        await db
          .update(metaAdAccounts)
          .set({
            name: aa.name,
            currency: aa.currency,
            timezone: aa.timezone_name,
            status: aa.account_status,
            metaBusinessId: aa.business?.id ?? null,
            updatedAt: new Date(),
          })
          .where(eq(metaAdAccounts.id, existingAa[0].id));
      } else {
        await db.insert(metaAdAccounts).values({
          workspaceId: workspace.id,
          connectionId,
          metaAdAccountId: aa.id,
          metaBusinessId: aa.business?.id ?? null,
          name: aa.name,
          currency: aa.currency,
          timezone: aa.timezone_name,
          status: aa.account_status,
        });
      }
    }

    const url = new URL("/app/settings/integrations", process.env.NEXT_PUBLIC_APP_URL);
    url.searchParams.set("connected", "meta");
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof MetaApiError) return errorRedirect(`meta_${err.code}`);
    return errorRedirect("oauth_failed");
  }
}
```

- [ ] **Step 2: Manual verification**

1. Run dev server, go to `http://localhost:3000/api/auth/meta/login` while authenticated.
2. Complete the Meta OAuth flow in the browser.
3. You should be redirected to `/app/settings/integrations?connected=meta` (which will 404 — that page doesn't exist yet, that's OK).
4. Verify in DB: `SELECT * FROM meta_connections;` returns one row with your Meta user ID.
5. Verify: `SELECT * FROM meta_ad_accounts;` returns one row per ad account you have access to.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/meta/callback/route.ts
git commit -m "feat(meta): add OAuth callback route with ad account discovery"
```

---

## Task 11 — Server actions for connection management

**Files:**
- Create: `app/actions/meta-connections.ts`

- [ ] **Step 1: Create the file**

```ts
// app/actions/meta-connections.ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections, accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";

async function getWorkspaceOrFail(userId: string) {
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("Workspace no encontrado");
  return workspace;
}

export async function disconnectMetaConnection(connectionId: string): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);
  await db
    .delete(metaConnections)
    .where(
      and(
        eq(metaConnections.id, connectionId),
        eq(metaConnections.workspaceId, workspace.id)
      )
    );
  revalidatePath("/app/settings/integrations");
}

export async function updateAdAccountMapping(input: {
  adAccountId: string;
  accountId: string | null;
  isEcommerce: boolean;
  conversionEvent: string;
}): Promise<void> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceOrFail(userId);

  const ad = await db
    .select({ id: metaAdAccounts.id, currentAccountId: metaAdAccounts.accountId })
    .from(metaAdAccounts)
    .where(
      and(
        eq(metaAdAccounts.id, input.adAccountId),
        eq(metaAdAccounts.workspaceId, workspace.id)
      )
    )
    .limit(1);
  if (ad.length === 0) throw new Error("Ad account no encontrado");

  const wasUnmapped = ad[0].currentAccountId === null;
  const isNowMapped = input.accountId !== null;
  const newlyMapped = wasUnmapped && isNowMapped;

  await db
    .update(metaAdAccounts)
    .set({
      accountId: input.accountId,
      isEcommerce: input.isEcommerce,
      conversionEvent: input.conversionEvent,
      updatedAt: new Date(),
    })
    .where(eq(metaAdAccounts.id, input.adAccountId));

  // Set hasAdConnections flag on the plani.fyi account
  if (input.accountId) {
    await db
      .update(accounts)
      .set({ hasAdConnections: true, updatedAt: new Date() })
      .where(eq(accounts.id, input.accountId));
  }

  revalidatePath("/app/settings/integrations");
  if (input.accountId) revalidatePath(`/app/accounts/${input.accountId}`);

  // Trigger backfill when newly mapped (Task 16 wires this)
  if (newlyMapped) {
    const { tasks } = await import("@trigger.dev/sdk");
    await tasks.trigger("backfill-meta-ads", { adAccountId: input.adAccountId });
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run type-check` — expect clean.

```bash
git add app/actions/meta-connections.ts
git commit -m "feat(meta): add server actions for connection and ad account mapping"
```

---

## Task 12 — Ad account mapping form component

**Files:**
- Create: `components/ad-account-mapping-form.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/ad-account-mapping-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAdAccountMapping } from "@/app/actions/meta-connections";

const CONVERSION_EVENTS = [
  { value: "lead", label: "Lead" },
  { value: "complete_registration", label: "CompleteRegistration" },
  { value: "contact", label: "Contact" },
  { value: "submit_application", label: "SubmitApplication" },
  { value: "purchase", label: "Purchase (e-commerce)" },
] as const;

interface PlaniAccount {
  id: string;
  name: string;
}

interface AdAccountMappingFormProps {
  adAccountId: string;
  currentAccountId: string | null;
  currentIsEcommerce: boolean;
  currentConversionEvent: string;
  planiAccounts: PlaniAccount[];
}

export function AdAccountMappingForm({
  adAccountId,
  currentAccountId,
  currentIsEcommerce,
  currentConversionEvent,
  planiAccounts,
}: AdAccountMappingFormProps) {
  const [accountId, setAccountId] = useState<string>(currentAccountId ?? "");
  const [isEcommerce, setIsEcommerce] = useState(currentIsEcommerce);
  const [conversionEvent, setConversionEvent] = useState(currentConversionEvent);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      await updateAdAccountMapping({
        adAccountId,
        accountId: accountId || null,
        isEcommerce,
        conversionEvent,
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const dirty =
    (accountId || "") !== (currentAccountId ?? "") ||
    isEcommerce !== currentIsEcommerce ||
    conversionEvent !== currentConversionEvent;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        disabled={isPending}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Sin mapear</option>
        {planiAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <label className="inline-flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={isEcommerce}
          onChange={(e) => setIsEcommerce(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        E-commerce
      </label>

      <select
        value={conversionEvent}
        onChange={(e) => setConversionEvent(e.target.value)}
        disabled={isPending}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {CONVERSION_EVENTS.map((ev) => (
          <option key={ev.value} value={ev.value}>
            {ev.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={save}
        disabled={!dirty || isPending}
        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Guardando..." : saved ? "✓ Guardado" : "Guardar"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add components/ad-account-mapping-form.tsx
git commit -m "feat(meta): add ad account mapping form component"
```

---

## Task 13 — Settings integrations page

**Files:**
- Create: `app/(protected)/app/settings/integrations/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// app/(protected)/app/settings/integrations/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/drizzle/db";
import { metaConnections, metaAdAccounts, accounts } from "@/lib/drizzle/schema";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { DeleteButton } from "@/components/delete-button";
import { AdAccountMappingForm } from "@/components/ad-account-mapping-form";
import { disconnectMetaConnection } from "@/app/actions/meta-connections";

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string }>;
}

export default async function IntegrationsPage({ searchParams }: PageProps) {
  const userId = await requireUserId();
  const { connected, error } = await searchParams;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [connections, adAccounts, planiAccounts] = await Promise.all([
    db.select().from(metaConnections).where(eq(metaConnections.workspaceId, workspace.id)),
    db.select().from(metaAdAccounts).where(eq(metaAdAccounts.workspaceId, workspace.id)),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.workspaceId, workspace.id)),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Integraciones</h1>

      {connected === "meta" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 mb-6">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            ✓ Meta Ads conectado. Ahora mapeá los ad accounts a cuentas plani.fyi.
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-6">
          <p className="text-sm text-destructive">
            Error en la conexión: {error}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">📊 Meta Ads</h2>
          {connections.length === 0 && (
            <Link
              href="/api/auth/meta/login"
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Conectar Meta Ads
            </Link>
          )}
        </div>

        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no conectaste Meta. Conectá tu cuenta para ver los ad accounts de tus clientes.
          </p>
        ) : (
          <div className="space-y-4">
            {connections.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{c.metaUserName ?? c.metaUserId}</p>
                    <p className="text-xs text-muted-foreground">
                      Estado: {c.status}
                      {c.tokenExpiresAt && (
                        <> · Expira {new Date(c.tokenExpiresAt).toLocaleDateString("es-AR")}</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/api/auth/meta/login"
                      className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      Reconectar
                    </Link>
                    <DeleteButton
                      action={async () => {
                        "use server";
                        await disconnectMetaConnection(c.id);
                      }}
                      confirmMessage="¿Desconectar Meta? Se eliminarán todos los ad accounts vinculados."
                      className="inline-flex items-center rounded-md border border-destructive/30 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/10 transition-colors"
                    >
                      Desconectar
                    </DeleteButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {adAccounts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Ad accounts disponibles</h2>
          <div className="space-y-3">
            {adAccounts.map((aa) => (
              <div key={aa.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">{aa.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {aa.metaAdAccountId} · {aa.currency} · {aa.timezone}
                      {aa.lastSyncedAt && (
                        <> · última sync {new Date(aa.lastSyncedAt).toLocaleString("es-AR")}</>
                      )}
                    </p>
                  </div>
                </div>
                <AdAccountMappingForm
                  adAccountId={aa.id}
                  currentAccountId={aa.accountId}
                  currentIsEcommerce={aa.isEcommerce}
                  currentConversionEvent={aa.conversionEvent}
                  planiAccounts={planiAccounts}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

1. Ensure you ran Task 10 and have a connection row in DB.
2. Navigate to `http://localhost:3000/app/settings/integrations`.
3. You should see the list of ad accounts with mapping dropdowns.
4. Map one ad account to a plani.fyi account, click Guardar.
5. Refresh — the dropdown should show the mapping persisted.
6. Verify DB: `SELECT account_id, is_ecommerce, conversion_event FROM meta_ad_accounts WHERE id = '...'`.

- [ ] **Step 3: Commit**

```bash
git add app/\(protected\)/app/settings/integrations/page.tsx
git commit -m "feat(meta): add settings integrations page"
```

---

## Task 14 — Sync insights helper (`lib/meta/sync-insights.ts`)

**Files:**
- Create: `lib/meta/sync-insights.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/meta/sync-insights.ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaCampaigns,
  metaInsightsDaily,
  metaAdAccounts,
  metaConnections,
} from "@/lib/drizzle/schema";
import { metaGraphFetch } from "./client";

type CampaignApi = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
};

type InsightAction = { action_type: string; value: string };

type InsightApiRow = {
  date_start: string;
  date_stop: string;
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  frequency?: string;
  actions?: InsightAction[];
  action_values?: InsightAction[];
};

function moneyToCents(s: string | undefined): number {
  if (!s) return 0;
  return Math.round(parseFloat(s) * 100);
}

function intOrZero(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function extractConversions(
  actions: InsightAction[] | undefined,
  event: string
): number {
  if (!actions) return 0;
  const match = actions.find((a) => a.action_type === event);
  return match ? intOrZero(match.value) : 0;
}

function extractConversionValue(
  actionValues: InsightAction[] | undefined,
  event: string
): number | null {
  if (!actionValues) return null;
  const match = actionValues.find((a) => a.action_type === event);
  return match ? moneyToCents(match.value) : null;
}

export async function fetchAndUpsertCampaigns(
  adAccountRowId: string,
  metaAdAccountId: string,
  accessToken: string
): Promise<Map<string, string>> {
  const result = await metaGraphFetch<{ data: CampaignApi[] }>(
    `/${metaAdAccountId}/campaigns`,
    {
      accessToken,
      searchParams: {
        fields:
          "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
        limit: 200,
      },
    }
  );

  const metaToLocalId = new Map<string, string>();
  const now = new Date();

  for (const c of result.data) {
    const existing = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .where(
        and(
          eq(metaCampaigns.adAccountId, adAccountRowId),
          eq(metaCampaigns.metaCampaignId, c.id)
        )
      )
      .limit(1);

    const values = {
      adAccountId: adAccountRowId,
      metaCampaignId: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective ?? null,
      dailyBudget: c.daily_budget ? parseInt(c.daily_budget, 10) : null,
      lifetimeBudget: c.lifetime_budget ? parseInt(c.lifetime_budget, 10) : null,
      startTime: c.start_time ? new Date(c.start_time) : null,
      stopTime: c.stop_time ? new Date(c.stop_time) : null,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (existing.length > 0) {
      await db.update(metaCampaigns).set(values).where(eq(metaCampaigns.id, existing[0].id));
      metaToLocalId.set(c.id, existing[0].id);
    } else {
      const inserted = await db
        .insert(metaCampaigns)
        .values(values)
        .returning({ id: metaCampaigns.id });
      metaToLocalId.set(c.id, inserted[0].id);
    }
  }

  return metaToLocalId;
}

export async function fetchAndUpsertInsights(params: {
  adAccountRowId: string;
  metaAdAccountId: string;
  accessToken: string;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  conversionEvent: string;
  isEcommerce: boolean;
  campaignIdMap: Map<string, string>; // metaCampaignId -> local row id
}): Promise<number> {
  const result = await metaGraphFetch<{ data: InsightApiRow[] }>(
    `/${params.metaAdAccountId}/insights`,
    {
      accessToken: params.accessToken,
      searchParams: {
        level: "campaign",
        time_increment: 1,
        time_range: JSON.stringify({ since: params.since, until: params.until }),
        fields: "campaign_id,spend,impressions,reach,clicks,frequency,actions,action_values",
        limit: 500,
      },
    }
  );

  let upserts = 0;
  for (const row of result.data) {
    if (!row.campaign_id || !row.date_start) continue;
    const localCampaignId = params.campaignIdMap.get(row.campaign_id);
    if (!localCampaignId) continue; // campaign not synced yet

    const values = {
      adAccountId: params.adAccountRowId,
      campaignId: localCampaignId,
      date: row.date_start,
      spend: moneyToCents(row.spend),
      impressions: intOrZero(row.impressions),
      reach: intOrZero(row.reach),
      clicks: intOrZero(row.clicks),
      conversions: extractConversions(row.actions, params.conversionEvent),
      conversionValue: params.isEcommerce
        ? extractConversionValue(row.action_values, params.conversionEvent)
        : null,
      frequency: row.frequency ? row.frequency : null,
    };

    await db
      .insert(metaInsightsDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [
          metaInsightsDaily.adAccountId,
          metaInsightsDaily.campaignId,
          metaInsightsDaily.date,
        ],
        set: {
          spend: values.spend,
          impressions: values.impressions,
          reach: values.reach,
          clicks: values.clicks,
          conversions: values.conversions,
          conversionValue: values.conversionValue,
          frequency: values.frequency,
        },
      });
    upserts++;
  }
  return upserts;
}

export async function getAdAccountWithConnection(adAccountRowId: string) {
  const rows = await db
    .select({
      adAccount: metaAdAccounts,
      accessToken: metaConnections.accessToken,
      connectionStatus: metaConnections.status,
    })
    .from(metaAdAccounts)
    .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
    .where(eq(metaAdAccounts.id, adAccountRowId))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add lib/meta/sync-insights.ts
git commit -m "feat(meta): add sync-insights helpers for campaigns and daily insights"
```

---

## Task 15 — `sync-single-ad-account` task

**Files:**
- Create: `trigger/tasks/sync-single-ad-account.ts`

- [ ] **Step 1: Create the file**

```ts
// trigger/tasks/sync-single-ad-account.ts
import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections } from "@/lib/drizzle/schema";
import {
  fetchAndUpsertCampaigns,
  fetchAndUpsertInsights,
  getAdAccountWithConnection,
} from "@/lib/meta/sync-insights";
import { MetaApiError } from "@/lib/meta/client";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface SyncSingleInput {
  adAccountId: string; // local row id
  /** If provided, overrides the rolling 3-day window. Used by backfill. */
  customRange?: { since: string; until: string };
}

export const syncSingleAdAccount = task({
  id: "sync-single-ad-account",
  retry: { maxAttempts: 3 },
  maxDuration: 300,
  run: async (payload: SyncSingleInput): Promise<{ insightsUpserted: number }> => {
    const row = await getAdAccountWithConnection(payload.adAccountId);
    if (!row) throw new AbortTaskRunError("ad account not found");
    if (row.connectionStatus !== "active") {
      logger.warn("Skipping sync — connection not active", {
        adAccountId: payload.adAccountId,
        status: row.connectionStatus,
      });
      return { insightsUpserted: 0 };
    }

    const accessToken = row.accessToken;
    const metaId = row.adAccount.metaAdAccountId;

    try {
      const campaignMap = await fetchAndUpsertCampaigns(
        payload.adAccountId,
        metaId,
        accessToken
      );

      const today = new Date();
      const range = payload.customRange ?? {
        since: isoDate(new Date(today.getTime() - 3 * 86400000)),
        until: isoDate(today),
      };

      const upserts = await fetchAndUpsertInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: range.since,
        until: range.until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        campaignIdMap: campaignMap,
      });

      await db
        .update(metaAdAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(metaAdAccounts.id, payload.adAccountId));

      logger.info("sync complete", { adAccountId: payload.adAccountId, upserts });
      return { insightsUpserted: upserts };
    } catch (err) {
      if (err instanceof MetaApiError && err.isAuthError()) {
        logger.error("token expired/revoked — marking connection expired", {
          adAccountId: payload.adAccountId,
        });
        await db
          .update(metaConnections)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(metaConnections.id, row.adAccount.connectionId));
        throw new AbortTaskRunError("meta_auth_error");
      }
      if (err instanceof MetaApiError && err.isRateLimit()) {
        logger.warn("rate limited — will retry", { code: err.code });
      }
      throw err;
    }
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add trigger/tasks/sync-single-ad-account.ts
git commit -m "feat(meta): add per-ad-account sync task with error handling"
```

---

## Task 16 — `sync-meta-ads` scheduled cron

**Files:**
- Create: `trigger/tasks/sync-meta-ads.ts`

- [ ] **Step 1: Create the file**

```ts
// trigger/tasks/sync-meta-ads.ts
import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections } from "@/lib/drizzle/schema";
import { syncSingleAdAccount } from "./sync-single-ad-account";

export const syncMetaAds = schedules.task({
  id: "sync-meta-ads",
  cron: "5 * * * *", // every hour at :05
  run: async () => {
    const rows = await db
      .select({ id: metaAdAccounts.id })
      .from(metaAdAccounts)
      .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
      .where(
        and(
          isNotNull(metaAdAccounts.accountId),
          eq(metaConnections.status, "active")
        )
      );

    logger.info(`found ${rows.length} mapped ad accounts to sync`);

    if (rows.length === 0) return { triggered: 0 };

    await syncSingleAdAccount.batchTrigger(
      rows.map((r) => ({ payload: { adAccountId: r.id } }))
    );

    return { triggered: rows.length };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add trigger/tasks/sync-meta-ads.ts
git commit -m "feat(meta): add hourly scheduled cron for ad account sync"
```

---

## Task 17 — `backfill-meta-ads` task

**Files:**
- Create: `trigger/tasks/backfill-meta-ads.ts`

- [ ] **Step 1: Create the file**

```ts
// trigger/tasks/backfill-meta-ads.ts
import { task, logger } from "@trigger.dev/sdk/v3";
import { syncSingleAdAccount } from "./sync-single-ad-account";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface BackfillInput {
  adAccountId: string; // local row id
  days?: number; // default 90
}

export const backfillMetaAds = task({
  id: "backfill-meta-ads",
  retry: { maxAttempts: 2 },
  maxDuration: 900,
  run: async (payload: BackfillInput) => {
    const days = payload.days ?? 90;
    const today = new Date();
    const since = isoDate(new Date(today.getTime() - days * 86400000));
    const until = isoDate(today);

    logger.info("starting backfill", { adAccountId: payload.adAccountId, since, until });

    const result = await syncSingleAdAccount.triggerAndWait({
      adAccountId: payload.adAccountId,
      customRange: { since, until },
    });
    if (!result.ok) throw new Error("backfill sync failed");
    return { insightsUpserted: result.output.insightsUpserted };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add trigger/tasks/backfill-meta-ads.ts
git commit -m "feat(meta): add 90-day backfill task triggered on first mapping"
```

---

## Task 18 — `refresh-meta-tokens` daily cron

**Files:**
- Create: `trigger/tasks/refresh-meta-tokens.ts`

- [ ] **Step 1: Create the file**

```ts
// trigger/tasks/refresh-meta-tokens.ts
import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaConnections } from "@/lib/drizzle/schema";
import { exchangeShortForLongToken, tokenExpiryDate } from "@/lib/meta/oauth";
import { MetaApiError } from "@/lib/meta/client";

export const refreshMetaTokens = schedules.task({
  id: "refresh-meta-tokens",
  cron: "0 3 * * *", // daily at 3am UTC
  run: async () => {
    const soon = new Date(Date.now() + 7 * 86400000);
    const rows = await db
      .select()
      .from(metaConnections)
      .where(
        and(
          eq(metaConnections.status, "active"),
          lte(metaConnections.tokenExpiresAt, soon)
        )
      );

    logger.info(`found ${rows.length} connections expiring within 7 days`);

    let refreshed = 0;
    let failed = 0;
    for (const c of rows) {
      try {
        const next = await exchangeShortForLongToken(c.accessToken);
        await db
          .update(metaConnections)
          .set({
            accessToken: next.access_token,
            tokenExpiresAt: tokenExpiryDate(next),
            updatedAt: new Date(),
          })
          .where(eq(metaConnections.id, c.id));
        refreshed++;
      } catch (err) {
        failed++;
        if (err instanceof MetaApiError && err.isAuthError()) {
          await db
            .update(metaConnections)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(metaConnections.id, c.id));
        }
        logger.error("token refresh failed", {
          connectionId: c.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { refreshed, failed };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add trigger/tasks/refresh-meta-tokens.ts
git commit -m "feat(meta): add daily token refresh cron"
```

---

## Task 19 — Manual end-to-end sync verification

- [ ] **Step 1: Restart Trigger.dev worker**

In the terminal running the trigger worker, Ctrl+C and restart:

```bash
npx trigger.dev@latest dev
```

This picks up the new tasks.

- [ ] **Step 2: Trigger a manual sync for one ad account**

In the Trigger.dev dashboard (cloud.trigger.dev), find `sync-single-ad-account` and run it manually with payload:

```json
{ "adAccountId": "<uuid-of-a-mapped-ad-account-in-meta_ad_accounts>" }
```

- [ ] **Step 3: Verify data landed**

```sql
SELECT COUNT(*) FROM meta_campaigns WHERE ad_account_id = '<uuid>';
SELECT date, SUM(spend)/100.0 AS spend_usd, SUM(clicks), SUM(conversions)
FROM meta_insights_daily WHERE ad_account_id = '<uuid>'
GROUP BY date ORDER BY date DESC LIMIT 5;
```

Expected: campaigns count matches what you see in Meta Ads Manager; insights rows exist for the last 3 days.

- [ ] **Step 4: Trigger the backfill via UI**

In `/app/settings/integrations`, un-map and re-map an ad account. This should fire `backfill-meta-ads`. Check the Trigger.dev dashboard for the run, then re-check the DB — you should now see ~90 days of data.

- [ ] **Step 5: No commit** — this is a verification task.

---

## Task 20 — Paid Media queries (`lib/queries/paid-media.ts`)

**Files:**
- Create: `lib/queries/paid-media.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/queries/paid-media.ts
import { and, eq, sql, gte, lte, desc } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaAdAccounts,
  metaCampaigns,
  metaInsightsDaily,
  metaConnections,
} from "@/lib/drizzle/schema";

export type PaidMediaConnectionState =
  | { state: "no_connection" }
  | { state: "no_mapping"; connectionStatus: "active" | "expired" | "revoked"; connectionId: string }
  | {
      state: "mapped";
      connectionStatus: "active" | "expired" | "revoked";
      adAccount: {
        id: string;
        metaAdAccountId: string;
        name: string;
        currency: string;
        timezone: string;
        status: number;
        isEcommerce: boolean;
        conversionEvent: string;
        lastSyncedAt: Date | null;
      };
    };

export async function getPaidMediaState(
  workspaceId: string,
  accountId: string
): Promise<PaidMediaConnectionState> {
  const connections = await db
    .select({ id: metaConnections.id, status: metaConnections.status })
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspaceId))
    .limit(1);

  if (connections.length === 0) return { state: "no_connection" };
  const conn = connections[0];

  const ad = await db
    .select()
    .from(metaAdAccounts)
    .where(
      and(
        eq(metaAdAccounts.workspaceId, workspaceId),
        eq(metaAdAccounts.accountId, accountId)
      )
    )
    .limit(1);

  if (ad.length === 0) {
    return {
      state: "no_mapping",
      connectionStatus: conn.status as "active" | "expired" | "revoked",
      connectionId: conn.id,
    };
  }

  return {
    state: "mapped",
    connectionStatus: conn.status as "active" | "expired" | "revoked",
    adAccount: {
      id: ad[0].id,
      metaAdAccountId: ad[0].metaAdAccountId,
      name: ad[0].name,
      currency: ad[0].currency,
      timezone: ad[0].timezone,
      status: ad[0].status,
      isEcommerce: ad[0].isEcommerce,
      conversionEvent: ad[0].conversionEvent,
      lastSyncedAt: ad[0].lastSyncedAt,
    },
  };
}

export type KpiSet = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  conversionValue: number | null;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number | null;
};

function computeDerived(base: Omit<KpiSet, "ctr" | "cpc" | "cpm" | "cpa" | "roas">): KpiSet {
  const { spend, impressions, clicks, conversions, conversionValue } = base;
  return {
    ...base,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks / 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 / 100 : 0,
    cpa: conversions > 0 ? spend / conversions / 100 : 0,
    roas: conversionValue != null && spend > 0 ? conversionValue / spend : null,
  };
}

export async function getKpisForRange(
  adAccountId: string,
  since: string,
  until: string
): Promise<KpiSet> {
  const rows = await db
    .select({
      spend: sql<number>`COALESCE(SUM(${metaInsightsDaily.spend}), 0)::int`,
      impressions: sql<number>`COALESCE(SUM(${metaInsightsDaily.impressions}), 0)::int`,
      reach: sql<number>`COALESCE(SUM(${metaInsightsDaily.reach}), 0)::int`,
      clicks: sql<number>`COALESCE(SUM(${metaInsightsDaily.clicks}), 0)::int`,
      conversions: sql<number>`COALESCE(SUM(${metaInsightsDaily.conversions}), 0)::int`,
      conversionValue: sql<number | null>`SUM(${metaInsightsDaily.conversionValue})::int`,
      frequency: sql<number>`COALESCE(AVG(${metaInsightsDaily.frequency}), 0)::float`,
    })
    .from(metaInsightsDaily)
    .where(
      and(
        eq(metaInsightsDaily.adAccountId, adAccountId),
        gte(metaInsightsDaily.date, since),
        lte(metaInsightsDaily.date, until)
      )
    );
  const r = rows[0];
  return computeDerived({
    spend: r.spend,
    impressions: r.impressions,
    reach: r.reach,
    clicks: r.clicks,
    conversions: r.conversions,
    conversionValue: r.conversionValue,
    frequency: r.frequency,
  });
}

export type KpisWithDelta = {
  current: KpiSet;
  previous: KpiSet;
  deltas: Record<keyof KpiSet, number | null>;
};

function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

export async function getKpisWithComparison(
  adAccountId: string,
  since: string,
  until: string
): Promise<KpisWithDelta> {
  const start = new Date(since);
  const end = new Date(until);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [current, previous] = await Promise.all([
    getKpisForRange(adAccountId, since, until),
    getKpisForRange(adAccountId, iso(prevStart), iso(prevEnd)),
  ]);

  const keys = Object.keys(current) as (keyof KpiSet)[];
  const deltas = {} as Record<keyof KpiSet, number | null>;
  for (const k of keys) {
    const c = current[k];
    const p = previous[k];
    deltas[k] = pctDelta(
      typeof c === "number" ? c : null,
      typeof p === "number" ? p : null
    );
  }
  return { current, previous, deltas };
}

export type CampaignRow = {
  id: string;
  metaCampaignId: string;
  name: string;
  status: string;
  objective: string | null;
  dailyBudget: number | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpa: number;
};

export async function getCampaignsWithKpis(
  adAccountId: string,
  since: string,
  until: string
): Promise<CampaignRow[]> {
  const rows = await db
    .select({
      id: metaCampaigns.id,
      metaCampaignId: metaCampaigns.metaCampaignId,
      name: metaCampaigns.name,
      status: metaCampaigns.status,
      objective: metaCampaigns.objective,
      dailyBudget: metaCampaigns.dailyBudget,
      spend: sql<number>`COALESCE(SUM(${metaInsightsDaily.spend}), 0)::int`,
      impressions: sql<number>`COALESCE(SUM(${metaInsightsDaily.impressions}), 0)::int`,
      reach: sql<number>`COALESCE(SUM(${metaInsightsDaily.reach}), 0)::int`,
      clicks: sql<number>`COALESCE(SUM(${metaInsightsDaily.clicks}), 0)::int`,
      conversions: sql<number>`COALESCE(SUM(${metaInsightsDaily.conversions}), 0)::int`,
      frequency: sql<number>`COALESCE(AVG(${metaInsightsDaily.frequency}), 0)::float`,
    })
    .from(metaCampaigns)
    .leftJoin(
      metaInsightsDaily,
      and(
        eq(metaInsightsDaily.campaignId, metaCampaigns.id),
        gte(metaInsightsDaily.date, since),
        lte(metaInsightsDaily.date, until)
      )
    )
    .where(eq(metaCampaigns.adAccountId, adAccountId))
    .groupBy(metaCampaigns.id);

  return rows.map((r) => ({
    id: r.id,
    metaCampaignId: r.metaCampaignId,
    name: r.name,
    status: r.status,
    objective: r.objective,
    dailyBudget: r.dailyBudget,
    spend: r.spend,
    impressions: r.impressions,
    reach: r.reach,
    clicks: r.clicks,
    conversions: r.conversions,
    frequency: r.frequency,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpc: r.clicks > 0 ? r.spend / r.clicks / 100 : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions / 100 : 0,
  }));
}

export type CampaignTrendPoint = {
  date: string;
  spend: number;
  conversions: number;
};

export async function getCampaignTrend(
  campaignId: string,
  days: number = 30
): Promise<CampaignTrendPoint[]> {
  const today = new Date();
  const since = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      date: metaInsightsDaily.date,
      spend: sql<number>`${metaInsightsDaily.spend}::int`,
      conversions: sql<number>`${metaInsightsDaily.conversions}::int`,
    })
    .from(metaInsightsDaily)
    .where(
      and(
        eq(metaInsightsDaily.campaignId, campaignId),
        gte(metaInsightsDaily.date, since)
      )
    )
    .orderBy(desc(metaInsightsDaily.date));
  return rows.map((r) => ({ date: r.date, spend: r.spend, conversions: r.conversions }));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add lib/queries/paid-media.ts
git commit -m "feat(meta): add paid-media queries (state, KPIs with comparison, campaigns, trend)"
```

---

## Task 21 — Install recharts

- [ ] **Step 1: Install**

Run: `npm install recharts`
Expected: adds `recharts` to `package.json` dependencies.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(paid-media): add recharts dependency for trend charts"
```

---

## Task 22 — `PaidMediaKpiCard` component

**Files:**
- Create: `components/paid-media-kpi-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/paid-media-kpi-card.tsx
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

interface PaidMediaKpiCardProps {
  label: string;
  value: string;
  delta?: number | null;
  /** If true, a negative delta is good (e.g. CPA, CPC). */
  invertColors?: boolean;
}

export function PaidMediaKpiCard({ label, value, delta, invertColors }: PaidMediaKpiCardProps) {
  const deltaFormatted = delta == null ? null : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  const isPositive = delta != null && delta >= 0;
  const isGood = invertColors ? !isPositive : isPositive;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
      {deltaFormatted && (
        <p
          className={`text-xs flex items-center gap-0.5 mt-0.5 ${
            delta === 0
              ? "text-muted-foreground"
              : isGood
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {delta != null && delta !== 0 &&
            (isPositive ? <ArrowUpIcon size={10} /> : <ArrowDownIcon size={10} />)}
          {deltaFormatted}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/paid-media-kpi-card.tsx
git commit -m "feat(paid-media): add KpiCard component with delta indicator"
```

---

## Task 23 — `PaidMediaPeriodSelector` component

**Files:**
- Create: `components/paid-media-period-selector.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/paid-media-period-selector.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const PRESETS = [
  { value: "7", label: "7 días" },
  { value: "14", label: "14 días" },
  { value: "30", label: "30 días" },
] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PaidMediaPeriodSelector() {
  const router = useRouter();
  const params = useSearchParams();

  const preset = params.get("preset") ?? "7";
  const sinceParam = params.get("since");
  const untilParam = params.get("until");
  const isCustom = preset === "custom";

  const applyPreset = useCallback(
    (days: number) => {
      const qp = new URLSearchParams(params);
      qp.set("preset", String(days));
      qp.delete("since");
      qp.delete("until");
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const applyCustom = useCallback(
    (since: string, until: string) => {
      const qp = new URLSearchParams(params);
      qp.set("preset", "custom");
      qp.set("since", since);
      qp.set("until", until);
      router.push(`?${qp.toString()}`);
    },
    [params, router]
  );

  const today = isoDate(new Date());
  const defaultSince =
    sinceParam ?? isoDate(new Date(Date.now() - 7 * 86400000));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => applyPreset(Number(p.value))}
          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            preset === p.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {p.label}
        </button>
      ))}

      <div className="flex items-center gap-1">
        <input
          type="date"
          value={isCustom ? sinceParam ?? defaultSince : ""}
          max={today}
          onChange={(e) => applyCustom(e.target.value, untilParam ?? today)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <input
          type="date"
          value={isCustom ? untilParam ?? today : ""}
          max={today}
          onChange={(e) => applyCustom(sinceParam ?? defaultSince, e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/paid-media-period-selector.tsx
git commit -m "feat(paid-media): add period selector with presets and custom range"
```

---

## Task 24 — `PaidMediaMiniCard` + wiring into account page

**Files:**
- Create: `components/paid-media-mini-card.tsx`
- Create: `components/paid-media-reconnect-banner.tsx`
- Modify: `app/(protected)/app/accounts/[accountId]/page.tsx`

- [ ] **Step 1: Create the reconnect banner**

```tsx
// components/paid-media-reconnect-banner.tsx
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function PaidMediaReconnectBanner() {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 flex items-center gap-2">
      <AlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          Reconectar Meta
        </p>
        <p className="text-xs text-muted-foreground">
          El token expiró. Los datos de paid media no se están actualizando.
        </p>
      </div>
      <Link
        href="/api/auth/meta/login"
        className="shrink-0 inline-flex items-center rounded-md bg-red-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-red-700 transition-colors"
      >
        Reconectar
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Create the mini-card**

```tsx
// components/paid-media-mini-card.tsx
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import {
  getPaidMediaState,
  getKpisWithComparison,
} from "@/lib/queries/paid-media";
import { PaidMediaKpiCard } from "./paid-media-kpi-card";
import { PaidMediaReconnectBanner } from "./paid-media-reconnect-banner";

interface PaidMediaMiniCardProps {
  workspaceId: string;
  accountId: string;
}

function formatMoney(cents: number, currency: string): string {
  const val = cents / 100;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(val);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeAgo(d: Date | null): string {
  if (!d) return "nunca";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs} h`;
}

export async function PaidMediaMiniCard({ workspaceId, accountId }: PaidMediaMiniCardProps) {
  const state = await getPaidMediaState(workspaceId, accountId);

  if (state.state === "no_connection") {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Paid Media</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Conectá Meta Ads para ver el performance de las campañas de esta cuenta.
        </p>
        <Link
          href="/api/auth/meta/login"
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Conectar Meta Ads
        </Link>
      </div>
    );
  }

  if (state.state === "no_mapping") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        {state.connectionStatus === "expired" && <PaidMediaReconnectBanner />}
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Paid Media</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Vinculá un ad account a esta cuenta.
        </p>
        <Link
          href="/app/settings/integrations"
          className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          Ir a integraciones
        </Link>
      </div>
    );
  }

  // state === "mapped"
  const today = isoDate(new Date());
  const since = isoDate(new Date(Date.now() - 6 * 86400000));
  const { current, deltas } = await getKpisWithComparison(state.adAccount.id, since, today);

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      {state.connectionStatus === "expired" && <PaidMediaReconnectBanner />}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-muted-foreground" />
          <h2 className="font-semibold">Paid Media</h2>
          <span className="text-xs text-muted-foreground">· últimos 7 días</span>
        </div>
        <Link
          href={`/app/accounts/${accountId}/paid-media`}
          className="text-xs text-primary hover:underline"
        >
          Ver todo →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <PaidMediaKpiCard
          label="Spend"
          value={formatMoney(current.spend, state.adAccount.currency)}
          delta={deltas.spend}
        />
        <PaidMediaKpiCard
          label={state.adAccount.isEcommerce ? "ROAS" : "CPA"}
          value={
            state.adAccount.isEcommerce
              ? current.roas != null ? current.roas.toFixed(2) + "x" : "—"
              : current.conversions > 0
              ? formatMoney(Math.round(current.cpa * 100), state.adAccount.currency)
              : "—"
          }
          delta={state.adAccount.isEcommerce ? deltas.roas : deltas.cpa}
          invertColors={!state.adAccount.isEcommerce}
        />
        <PaidMediaKpiCard
          label="CTR"
          value={`${current.ctr.toFixed(2)}%`}
          delta={deltas.ctr}
        />
        <PaidMediaKpiCard
          label="Conversiones"
          value={current.conversions.toString()}
          delta={deltas.conversions}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Sync {timeAgo(state.adAccount.lastSyncedAt)} ·{" "}
        <Link
          href="/app/settings/integrations"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Configurar
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Mount in account page**

Modify `app/(protected)/app/accounts/[accountId]/page.tsx`. After the existing `ParticipantsPanel` collapsible section and BEFORE the `Signals` one (or wherever makes sense in the flow), add:

Add the import near the top with other component imports:

```tsx
import { PaidMediaMiniCard } from "@/components/paid-media-mini-card";
```

Then within the return's JSX, add the mini-card after the existing "Contexto de la cuenta" block but BEFORE the collapsible sections (since it's always visible, not collapsible). Look for the line:

```tsx
      {/* Transcript Upload */}
```

And insert immediately above it:

```tsx
      {/* Paid Media mini-card */}
      <div className="mb-6">
        <PaidMediaMiniCard workspaceId={workspace.id} accountId={accountId} />
      </div>
```

- [ ] **Step 4: Manual verification**

1. Reload `/app/accounts/[some-mapped-account-id]`.
2. For an account with no mapping: the mini-card shows "Vincular ad account".
3. For a mapped account with synced data: the mini-card shows 4 KPIs with deltas.
4. If you manually set `status = 'expired'` in `meta_connections`: the red reconnect banner appears.

- [ ] **Step 5: Commit**

```bash
git add components/paid-media-mini-card.tsx components/paid-media-reconnect-banner.tsx app/\(protected\)/app/accounts/\[accountId\]/page.tsx
git commit -m "feat(paid-media): add mini-card on account page with 4 KPIs and status handling"
```

---

## Task 25 — `PaidMediaCampaignsTable` component

**Files:**
- Create: `components/paid-media-campaigns-table.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/paid-media-campaigns-table.tsx
"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CampaignRow } from "@/lib/queries/paid-media";
import { PaidMediaCampaignDrawer } from "./paid-media-campaign-drawer";

type SortKey = keyof Pick<
  CampaignRow,
  "name" | "status" | "spend" | "impressions" | "ctr" | "cpc" | "conversions" | "cpa" | "frequency"
>;

interface PaidMediaCampaignsTableProps {
  campaigns: CampaignRow[];
  currency: string;
  isEcommerce: boolean;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PaidMediaCampaignsTable({
  campaigns,
  currency,
  isEcommerce,
}: PaidMediaCampaignsTableProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "PAUSED">("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const rows = statusFilter === "all" ? campaigns : campaigns.filter((c) => c.status === statusFilter);
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [campaigns, statusFilter, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  const Header = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th className={`px-2 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {sortKey === k && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </button>
    </th>
  );

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "ACTIVE" | "PAUSED")}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">Todas</option>
          <option value="ACTIVE">Activas</option>
          <option value="PAUSED">Pausadas</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {filtered.length} campaña{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-muted/30 text-muted-foreground">
            <tr>
              <Header k="name" label="Campaña" />
              <Header k="status" label="Estado" />
              <Header k="spend" label="Spend" align="right" />
              <Header k="impressions" label="Impr." align="right" />
              <Header k="ctr" label="CTR" align="right" />
              <Header k="cpc" label="CPC" align="right" />
              <Header k="conversions" label="Conv." align="right" />
              <Header k="cpa" label={isEcommerce ? "CPA" : "CPL"} align="right" />
              <Header k="frequency" label="Freq" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <td className="px-2 py-2 max-w-[240px] truncate">{c.name}</td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      c.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">{formatMoney(c.spend, currency)}</td>
                <td className="px-2 py-2 text-right">{c.impressions.toLocaleString("es-AR")}</td>
                <td className="px-2 py-2 text-right">{c.ctr.toFixed(2)}%</td>
                <td className="px-2 py-2 text-right">
                  {c.clicks > 0 ? formatMoney(Math.round(c.cpc * 100), currency) : "—"}
                </td>
                <td className="px-2 py-2 text-right">{c.conversions}</td>
                <td className="px-2 py-2 text-right">
                  {c.conversions > 0 ? formatMoney(Math.round(c.cpa * 100), currency) : "—"}
                </td>
                <td className="px-2 py-2 text-right">{c.frequency.toFixed(2)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">
                  Sin campañas con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaidMediaCampaignDrawer
        campaign={selectedCampaign}
        currency={currency}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit (after drawer exists)**

NOTE: this file imports `PaidMediaCampaignDrawer` which is created in the next task. The typecheck will fail until Task 26 lands — that's intentional, commit both together at the end of Task 26.

---

## Task 26 — `PaidMediaCampaignDrawer` component

**Files:**
- Create: `components/paid-media-campaign-drawer.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/paid-media-campaign-drawer.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CampaignRow, CampaignTrendPoint } from "@/lib/queries/paid-media";

interface PaidMediaCampaignDrawerProps {
  campaign: CampaignRow | null;
  currency: string;
  onClose: () => void;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PaidMediaCampaignDrawer({ campaign, currency, onClose }: PaidMediaCampaignDrawerProps) {
  const [trend, setTrend] = useState<CampaignTrendPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    setLoading(true);
    fetch(`/api/paid-media/campaign-trend?campaignId=${campaign.id}`)
      .then((r) => r.json())
      .then((data: { trend: CampaignTrendPoint[] }) => {
        setTrend([...data.trend].reverse()); // chart wants chronological
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [campaign]);

  if (!campaign) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[500px] bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-5 border-b border-border sticky top-0 bg-background flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">{campaign.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {campaign.status} · {campaign.objective ?? "—"}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Spend</p>
              <p className="text-sm font-medium">{formatMoney(campaign.spend, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conv.</p>
              <p className="text-sm font-medium">{campaign.conversions}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CPA</p>
              <p className="text-sm font-medium">
                {campaign.conversions > 0
                  ? formatMoney(Math.round(campaign.cpa * 100), currency)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CTR</p>
              <p className="text-sm font-medium">{campaign.ctr.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CPC</p>
              <p className="text-sm font-medium">
                {campaign.clicks > 0 ? formatMoney(Math.round(campaign.cpc * 100), currency) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Freq</p>
              <p className="text-sm font-medium">{campaign.frequency.toFixed(2)}</p>
            </div>
            <div className="col-span-3">
              <p className="text-xs text-muted-foreground">Daily budget</p>
              <p className="text-sm font-medium">
                {campaign.dailyBudget != null
                  ? formatMoney(campaign.dailyBudget, currency)
                  : "sin tope diario"}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Últimos 30 días</h4>
            <div className="h-[220px]">
              {loading ? (
                <p className="text-xs text-muted-foreground">Cargando...</p>
              ) : trend.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin datos.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={10} />
                    <YAxis yAxisId="spend" orientation="left" fontSize={10} />
                    <YAxis yAxisId="conv" orientation="right" fontSize={10} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      yAxisId="spend"
                      type="monotone"
                      dataKey="spend"
                      name="Spend (cents)"
                      stroke="#6366f1"
                      dot={false}
                    />
                    <Line
                      yAxisId="conv"
                      type="monotone"
                      dataKey="conversions"
                      name="Conv."
                      stroke="#10b981"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the JSON API route for trend data**

Create `app/api/paid-media/campaign-trend/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { db } from "@/lib/drizzle/db";
import { metaCampaigns, metaAdAccounts } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getCampaignTrend } from "@/lib/queries/paid-media";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return NextResponse.json({ error: "no_workspace" }, { status: 401 });

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "missing_campaignId" }, { status: 400 });

  // Ensure the campaign belongs to this workspace
  const rows = await db
    .select({ id: metaCampaigns.id })
    .from(metaCampaigns)
    .innerJoin(metaAdAccounts, eq(metaCampaigns.adAccountId, metaAdAccounts.id))
    .where(and(eq(metaCampaigns.id, campaignId), eq(metaAdAccounts.workspaceId, workspace.id)))
    .limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const trend = await getCampaignTrend(campaignId);
  return NextResponse.json({ trend });
}
```

- [ ] **Step 3: Typecheck — now both Task 25 and 26 files compile together**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/paid-media-campaigns-table.tsx components/paid-media-campaign-drawer.tsx app/api/paid-media/campaign-trend/route.ts
git commit -m "feat(paid-media): add campaigns table with drawer and trend chart"
```

---

## Task 27 — Dedicated dashboard page

**Files:**
- Create: `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// app/(protected)/app/accounts/[accountId]/paid-media/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import {
  getPaidMediaState,
  getKpisWithComparison,
  getCampaignsWithKpis,
} from "@/lib/queries/paid-media";
import { PaidMediaKpiCard } from "@/components/paid-media-kpi-card";
import { PaidMediaPeriodSelector } from "@/components/paid-media-period-selector";
import { PaidMediaCampaignsTable } from "@/components/paid-media-campaigns-table";
import { PaidMediaReconnectBanner } from "@/components/paid-media-reconnect-banner";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ preset?: string; since?: string; until?: string }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function timeAgo(d: Date | null): string {
  if (!d) return "nunca";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs} h`;
}

export default async function PaidMediaPage({ params, searchParams }: PageProps) {
  const userId = await requireUserId();
  const { accountId } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const account = await getAccountById(accountId, workspace.id);
  if (!account) notFound();

  const state = await getPaidMediaState(workspace.id, accountId);
  if (state.state !== "mapped") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link
          href={`/app/accounts/${accountId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft size={15} />
          {account.name}
        </Link>
        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold mb-2">Paid Media no configurado</h1>
          <p className="text-sm text-muted-foreground mb-3">
            {state.state === "no_connection"
              ? "Conectá Meta Ads desde Integraciones para empezar."
              : "Vinculá un ad account a esta cuenta."}
          </p>
          <Link
            href={state.state === "no_connection" ? "/api/auth/meta/login" : "/app/settings/integrations"}
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {state.state === "no_connection" ? "Conectar Meta Ads" : "Ir a integraciones"}
          </Link>
        </div>
      </div>
    );
  }

  // Resolve period
  const today = new Date();
  let since: string;
  let until: string;
  if (sp.preset === "custom" && sp.since && sp.until) {
    since = sp.since;
    until = sp.until;
  } else {
    const days = sp.preset === "14" ? 14 : sp.preset === "30" ? 30 : 7;
    since = isoDate(new Date(today.getTime() - (days - 1) * 86400000));
    until = isoDate(today);
  }

  const [{ current, deltas }, campaigns] = await Promise.all([
    getKpisWithComparison(state.adAccount.id, since, until),
    getCampaignsWithKpis(state.adAccount.id, since, until),
  ]);

  const currency = state.adAccount.currency;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link
        href={`/app/accounts/${accountId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        {account.name}
      </Link>

      {state.connectionStatus === "expired" && (
        <div className="mb-6">
          <PaidMediaReconnectBanner />
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Paid Media · {account.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {state.adAccount.name} ({state.adAccount.metaAdAccountId}) · Sync{" "}
            {timeAgo(state.adAccount.lastSyncedAt)}
          </p>
        </div>
        <PaidMediaPeriodSelector />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <PaidMediaKpiCard label="Spend" value={formatMoney(current.spend, currency)} delta={deltas.spend} />
        <PaidMediaKpiCard
          label="Impresiones"
          value={current.impressions.toLocaleString("es-AR")}
          delta={deltas.impressions}
        />
        <PaidMediaKpiCard
          label="Alcance"
          value={current.reach.toLocaleString("es-AR")}
          delta={deltas.reach}
        />
        <PaidMediaKpiCard
          label="Clicks"
          value={current.clicks.toLocaleString("es-AR")}
          delta={deltas.clicks}
        />
        <PaidMediaKpiCard label="CTR" value={`${current.ctr.toFixed(2)}%`} delta={deltas.ctr} />
        <PaidMediaKpiCard
          label="CPM"
          value={current.impressions > 0 ? formatMoney(Math.round(current.cpm * 100), currency) : "—"}
          delta={deltas.cpm}
          invertColors
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-8">
        <PaidMediaKpiCard
          label="Conversiones"
          value={current.conversions.toString()}
          delta={deltas.conversions}
        />
        <PaidMediaKpiCard
          label={state.adAccount.isEcommerce ? "CPA" : "CPL"}
          value={
            current.conversions > 0
              ? formatMoney(Math.round(current.cpa * 100), currency)
              : "—"
          }
          delta={deltas.cpa}
          invertColors
        />
        <PaidMediaKpiCard
          label="Frecuencia"
          value={current.frequency.toFixed(2)}
          delta={deltas.frequency}
          invertColors
        />
        {state.adAccount.isEcommerce && (
          <PaidMediaKpiCard
            label="ROAS"
            value={current.roas != null ? current.roas.toFixed(2) + "x" : "—"}
            delta={deltas.roas}
          />
        )}
      </div>

      <h2 className="font-semibold mb-3">Campañas</h2>
      <PaidMediaCampaignsTable
        campaigns={campaigns}
        currency={currency}
        isEcommerce={state.adAccount.isEcommerce}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 3: Manual verification**

1. Visit `/app/accounts/<mapped-account-id>/paid-media`.
2. Verify all KPIs show values (or `—` when not applicable).
3. Click each preset (7/14/30) — KPIs should update.
4. Pick a custom range via the date inputs — KPIs should update.
5. Click a campaign row — the drawer opens with KPIs and a 30-day line chart.
6. If `isEcommerce = false`: no ROAS card; CPL label on CPA card.
7. If `isEcommerce = true`: ROAS card visible, CPA label.

- [ ] **Step 4: Commit**

```bash
git add app/\(protected\)/app/accounts/\[accountId\]/paid-media/page.tsx
git commit -m "feat(paid-media): add dedicated dashboard page with KPIs and campaigns table"
```

---

## Task 28 — End-to-end smoke test

No code changes. Confirm the entire flow works end-to-end.

- [ ] **Step 1: Full-path walkthrough**

1. As a fresh session (maybe different browser): visit an account detail page. The mini-card shows the "Conectar Meta Ads" CTA.
2. Click it → Meta OAuth → approve → redirect to `/app/settings/integrations?connected=meta`.
3. See the list of discovered ad accounts. Map one to the account.
4. Check Trigger.dev dashboard — a `backfill-meta-ads` run should have fired.
5. Wait for it to complete (~1-3 minutes depending on data volume).
6. Return to the account page — mini-card now shows 4 KPIs.
7. Click "Ver todo →" → lands on the dashboard with 9 KPIs + campaigns table.
8. Click a campaign → drawer opens with 30-day trend chart.
9. Wait for the next hourly sync (or manually trigger `sync-meta-ads` from the Trigger dashboard) — `lastSyncedAt` should update.

- [ ] **Step 2: Expired-token scenario**

1. In SQL: `UPDATE meta_connections SET status = 'expired' WHERE id = '...';`
2. Reload account page → red reconnect banner appears in mini-card.
3. Reload `/app/settings/integrations` — connection marked expired.
4. Click "Reconectar" on the settings page → re-OAuth → status returns to active.
5. Clean up: revert any SQL changes.

- [ ] **Step 3: Permission scenario**

1. In SQL: `UPDATE meta_ad_accounts SET account_id = NULL WHERE ...` (unmap).
2. Reload account page — mini-card shows "Vincular ad account".
3. In settings, re-map — backfill should NOT refire (we already have the data; this is expected because `newlyMapped` is only true when the previous `account_id` was null... wait, it WAS null in step 1). The backfill WILL refire, but `onConflictDoUpdate` in `meta_insights_daily` makes it idempotent. Acceptable.

- [ ] **Step 4: Summary commit (optional)**

If you've accumulated any test-data cleanup scripts or notes, commit them. Otherwise no commit needed.

---

## Out-of-scope reminders (for next sub-projects)

- **Sub-project 2**: signal triggers (7 alert types) reading from `meta_insights_daily`.
- **Sub-project 3**: weekly Claude-generated recommendations that auto-create tasks.

Do not pull forward either of these into this plan.
