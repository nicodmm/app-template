# Public Client View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-account read-only public URL (`/c/{token}`) the agency hands to its end-client, with module-level visibility toggles, optional password gate, redacted public-facing data, paid-media name overrides, and a separate client-friendly summary.

**Architecture:** New `account_share_links` table (token, password_hash, password_version, share_config jsonb, view_count). Single redaction-aware loader `getPublicAccountSnapshot` is the only entry point to public data. Public route at `app/(public)/c/[token]` outside the protected group; password gate uses an HMAC-signed cookie carrying `{token, password_version}` so password rotation invalidates old sessions automatically. Paid media gets `public_name` columns for client-friendly aliasing. Summary task gains a third `clientSummary` field generated in the same LLM call as the existing `accountSituation`.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Postgres (Supabase), Tailwind v4, Anthropic Haiku 4.5 (existing summary task), `bcryptjs` (new dep, pure JS so it deploys cleanly to Vercel + Trigger.dev).

---

## File Structure

**New files:**
- `lib/drizzle/schema/account_share_links.ts` — schema for the new table
- `drizzle/migrations/0027_<auto>.sql` — adds the table + 4 columns
- `drizzle/migrations/0027_<auto>/down.sql`
- `lib/share/token.ts` — random URL-safe token + slug helpers
- `lib/share/password.ts` — bcrypt hash/verify + per-token rate limiter
- `lib/share/cookie.ts` — HMAC-signed cookie encode/decode
- `lib/share/share-config.ts` — `ShareConfig` type + defaults + JSON validator
- `lib/queries/public-account.ts` — `getPublicAccountSnapshot(token)` redacted loader
- `app/actions/share-links.ts` — agency-side server actions
- `app/(public)/c/[token]/layout.tsx` — minimal public shell (no app chrome)
- `app/(public)/c/[token]/page.tsx` — public view with section gating
- `app/(public)/c/[token]/password-gate.tsx` — password form (client component)
- `app/(public)/c/[token]/not-found.tsx` — 404 for inactive/missing tokens
- `components/account-share-section.tsx` — agency-side config card
- `components/public-account-view/header.tsx` — account header, footer, layout chrome
- `components/public-account-view/summary-section.tsx`
- `components/public-account-view/context-section.tsx`
- `components/public-account-view/last-meeting-section.tsx`
- `components/public-account-view/files-section.tsx`
- `components/public-account-view/tasks-section.tsx`
- `components/public-account-view/participants-section.tsx`
- `components/public-account-view/signals-section.tsx`
- `components/public-account-view/health-section.tsx`
- `components/public-account-view/crm-section.tsx`
- `components/public-account-view/paid-media-section.tsx`
- `components/paid-media/public-name-editor.tsx` — inline rename UI used by both campaigns and ads sections

**Modified:**
- `lib/drizzle/schema/accounts.ts` — adds `clientSummary`, `clientSummaryUpdatedAt`
- `lib/drizzle/schema/meta_campaigns.ts` — adds `publicName`
- `lib/drizzle/schema/meta_ads.ts` — adds `publicName`
- `lib/drizzle/schema/index.ts` — re-export `accountShareLinks`
- `lib/ai/account-summary.ts` — extends schema + prompt to produce `clientSummary`
- `trigger/tasks/refresh-account-summary.ts` — persists `clientSummary` alongside `aiSummary`
- `app/(protected)/app/accounts/[accountId]/page.tsx` — mounts `<AccountShareSection />`
- `components/paid-media/campaigns-section.tsx` — wires `<PublicNameEditor />`
- `components/paid-media/ads-section.tsx` — wires `<PublicNameEditor />`
- `package.json` — `bcryptjs` + `@types/bcryptjs`
- `.env.example` — documents `SHARE_LINK_SECRET`

**Untouched:** Supabase auth setup, all existing protected routes, Trigger.dev infra outside the summary task.

---

### Task 1: Add bcryptjs dependency + share secret env

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install bcryptjs**

Run: `npm install bcryptjs && npm install --save-dev @types/bcryptjs`
Expected: both installed cleanly, `package.json` updated.

- [ ] **Step 2: Document the new env var**

Open `.env.example` (create if missing) and append:

```bash
# Used to HMAC-sign cookies for public client share links (`/c/{token}`).
# Generate with: openssl rand -base64 32
SHARE_LINK_SECRET=
```

- [ ] **Step 3: Set the secret locally**

In `.env.local`, add a generated secret:

```bash
SHARE_LINK_SECRET=<generated_value>
```

Generate with `openssl rand -base64 32` (or any 32-byte random source). Tell the user this same secret must be added to Vercel project env vars before deployment — without it, password gate cookies fail to verify.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add bcryptjs + share link secret env var"
```

---

### Task 2: Schema additions + migration

**Files:**
- Create: `lib/drizzle/schema/account_share_links.ts`
- Modify: `lib/drizzle/schema/accounts.ts`
- Modify: `lib/drizzle/schema/meta_campaigns.ts`
- Modify: `lib/drizzle/schema/meta_ads.ts`
- Modify: `lib/drizzle/schema/index.ts`
- Create: `drizzle/migrations/0027_<auto>.sql` (generated)
- Create: `drizzle/migrations/0027_<auto>/down.sql`

- [ ] **Step 1: Create the new schema file**

Write `lib/drizzle/schema/account_share_links.ts`:

```ts
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const accountShareLinks = pgTable(
  "account_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    passwordHash: text("password_hash"),
    passwordVersion: integer("password_version").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    shareConfig: jsonb("share_config")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    viewCount: integer("view_count").notNull().default(0),
    lastAccessedAt: timestamp("last_accessed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("account_share_links_account_idx").on(table.accountId),
    index("account_share_links_token_idx").on(table.token),
  ]
);

export type AccountShareLink = typeof accountShareLinks.$inferSelect;
export type NewAccountShareLink = typeof accountShareLinks.$inferInsert;
```

- [ ] **Step 2: Add the column to `accounts.ts`**

In `lib/drizzle/schema/accounts.ts`, add `clientSummary` and `clientSummaryUpdatedAt` immediately after the existing `aiSummaryUpdatedAt` field:

```ts
    aiSummary: text("ai_summary"),
    aiSummaryUpdatedAt: timestamp("ai_summary_updated_at"),
    clientSummary: text("client_summary"),
    clientSummaryUpdatedAt: timestamp("client_summary_updated_at"),
```

- [ ] **Step 3: Add `publicName` to `meta_campaigns.ts`**

In `lib/drizzle/schema/meta_campaigns.ts`, add immediately after `name`:

```ts
    name: text("name").notNull(),
    publicName: text("public_name"),
```

- [ ] **Step 4: Add `publicName` to `meta_ads.ts`**

Same pattern, immediately after `name`:

```ts
    name: text("name").notNull(),
    publicName: text("public_name"),
```

- [ ] **Step 5: Re-export the new schema from index**

Open `lib/drizzle/schema/index.ts` and add:

```ts
export * from "./account_share_links";
```

- [ ] **Step 6: Generate the migration**

Run: `npm run db:generate`
Expected: A new file `drizzle/migrations/0027_<some-name>.sql` is created with `CREATE TABLE "account_share_links" ...` and the four `ALTER TABLE ... ADD COLUMN ...` statements. Note the folder name (e.g. `0027_curious_phoenix`) — call it `<NAME>` below.

- [ ] **Step 7: Write the down migration**

Create `drizzle/migrations/<NAME>/down.sql` with:

```sql
ALTER TABLE "meta_ads" DROP COLUMN IF EXISTS "public_name";
ALTER TABLE "meta_campaigns" DROP COLUMN IF EXISTS "public_name";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "client_summary_updated_at";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "client_summary";
DROP TABLE IF EXISTS "account_share_links";
```

- [ ] **Step 8: Apply the migration**

Run: `npm run db:migrate`
Expected: success message; the new table and columns appear.

- [ ] **Step 9: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/drizzle/schema/ drizzle/migrations/0027_*
git commit -m "feat(share): account_share_links table + public_name + client_summary columns"
```

---

### Task 3: Token, password, and cookie utilities

**Files:**
- Create: `lib/share/token.ts`
- Create: `lib/share/password.ts`
- Create: `lib/share/cookie.ts`
- Create: `lib/share/share-config.ts`

- [ ] **Step 1: Token generator**

Write `lib/share/token.ts`:

```ts
import { randomBytes } from "node:crypto";

/** 32-char URL-safe random token. ~192 bits of entropy. */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}
```

- [ ] **Step 2: Password helpers**

Write `lib/share/password.ts`:

```ts
import bcrypt from "bcryptjs";

const COST = 10;

export async function hashSharePassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifySharePassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Per-token in-memory rate limiter. 5 fails in 60s → 5-min lockout.
// Vercel serverless instances each keep their own Map — good enough for MVP;
// upgrade to a Postgres counter if the limit becomes a real concern.
interface AttemptState {
  failuresWindowStart: number;
  failureCount: number;
  lockedUntil: number;
}
const attempts = new Map<string, AttemptState>();

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;

export function isRateLimited(token: string): {
  limited: boolean;
  retryAt: number | null;
} {
  const state = attempts.get(token);
  if (!state) return { limited: false, retryAt: null };
  if (state.lockedUntil > Date.now()) {
    return { limited: true, retryAt: state.lockedUntil };
  }
  return { limited: false, retryAt: null };
}

export function recordPasswordAttempt(
  token: string,
  success: boolean
): void {
  const now = Date.now();
  if (success) {
    attempts.delete(token);
    return;
  }
  const state = attempts.get(token) ?? {
    failuresWindowStart: now,
    failureCount: 0,
    lockedUntil: 0,
  };
  if (now - state.failuresWindowStart > WINDOW_MS) {
    state.failuresWindowStart = now;
    state.failureCount = 0;
  }
  state.failureCount += 1;
  if (state.failureCount >= MAX_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_MS;
    state.failureCount = 0;
    state.failuresWindowStart = now;
  }
  attempts.set(token, state);
}
```

- [ ] **Step 3: Signed cookie helpers**

Write `lib/share/cookie.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET_NAME = "SHARE_LINK_SECRET";

interface SharePayload {
  token: string;
  passwordVersion: number;
  exp: number; // unix ms
}

function getSecret(): string {
  const v = process.env[SECRET_NAME];
  if (!v) throw new Error(`${SECRET_NAME} not configured`);
  return v;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function encodeShareCookie(payload: SharePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function decodeShareCookie(cookie: string): SharePayload | null {
  const [body, sig] = cookie.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as SharePayload;
    if (decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function shareCookieName(token: string): string {
  return `share_${token}`;
}

export const SHARE_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
```

- [ ] **Step 4: ShareConfig type + defaults**

Write `lib/share/share-config.ts`:

```ts
export interface ShareConfig {
  summary: boolean;
  context: boolean;
  lastMeeting: boolean;
  files: boolean;
  tasks: boolean;
  participants: boolean;
  signals: boolean;
  crm: boolean;
  health: boolean;
  paidMedia: boolean;
}

export const DEFAULT_SHARE_CONFIG: ShareConfig = {
  summary: true,
  context: false,
  lastMeeting: true,
  files: true,
  tasks: true,
  participants: true,
  signals: false,
  crm: false,
  health: false,
  paidMedia: true,
};

export function coerceShareConfig(
  raw: Record<string, boolean> | null | undefined
): ShareConfig {
  const out: ShareConfig = { ...DEFAULT_SHARE_CONFIG };
  if (!raw) return out;
  for (const k of Object.keys(out) as Array<keyof ShareConfig>) {
    if (typeof raw[k] === "boolean") out[k] = raw[k];
  }
  return out;
}

export const SHARE_CONFIG_LABELS: Record<keyof ShareConfig, string> = {
  summary: "Resumen IA",
  context: "Contexto (objetivos, fechas, links)",
  lastMeeting: "Última reunión",
  files: "Archivos de contexto",
  tasks: "Tareas",
  participants: "Participantes",
  signals: "Señales (solo positivas)",
  crm: "CRM",
  health: "Salud de la cuenta",
  paidMedia: "Paid media",
};
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/share/
git commit -m "feat(share): token, password, cookie, and config utilities"
```

---

### Task 4: Public account snapshot loader (redaction)

**Files:**
- Create: `lib/queries/public-account.ts`

- [ ] **Step 1: Write the loader**

Write `lib/queries/public-account.ts`:

```ts
import { db } from "@/lib/drizzle/db";
import {
  accountShareLinks,
  accounts,
  transcripts,
  contextDocuments,
  tasks,
  participants,
  signals,
  accountHealthHistory,
  metaCampaigns,
  metaAds,
  metaInsightsDaily,
  metaAdAccounts,
  crmDeals,
  crmStages,
  crmPipelines,
  workspaces,
  users,
} from "@/lib/drizzle/schema";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { coerceShareConfig, type ShareConfig } from "@/lib/share/share-config";

export interface PublicAccountSnapshot {
  share: {
    token: string;
    requiresPassword: boolean;
    passwordVersion: number;
    isActive: boolean;
  };
  workspace: {
    name: string;
    logoUrl: string | null;
  };
  account: {
    id: string;
    name: string;
    industry: string | null;
    ownerName: string | null;
    lastActivityAt: Date | null;
  };
  config: ShareConfig;
  data: {
    summary: { clientSummary: string | null } | null;
    context: {
      goals: string | null;
      startDate: string | null;
      serviceScope: string | null;
      industry: string | null;
      location: string | null;
      companyDescription: string | null;
      websiteUrl: string | null;
      linkedinUrl: string | null;
    } | null;
    lastMeeting: {
      title: string;
      meetingDate: Date | null;
      meetingSummary: string | null;
    } | null;
    files: Array<{
      title: string;
      docType: string;
      createdAt: Date;
    }> | null;
    tasks: Array<{
      title: string;
      status: string;
      dueDate: string | null;
    }> | null;
    participants: Array<{
      name: string;
      role: string | null;
    }> | null;
    signals: Array<{
      type: string;
      description: string | null;
      createdAt: Date;
    }> | null;
    crm: {
      pipeline: string | null;
      stage: string | null;
    } | null;
    health: Array<{
      weekStart: Date;
      signal: string | null;
    }> | null;
    paidMedia: {
      campaigns: Array<{
        id: string;
        name: string; // already resolved to public_name ?? name
        status: string;
      }>;
      ads: Array<{
        id: string;
        campaignId: string;
        name: string; // already resolved to public_name ?? name
        status: string;
        thumbnailUrl: string | null;
      }>;
      kpis: {
        spend: number;
        impressions: number;
        clicks: number;
      };
    } | null;
  };
}

export interface SnapshotLookupResult {
  status: "ok" | "not_found" | "inactive" | "password_required";
  snapshot?: PublicAccountSnapshot;
  shareLinkId?: string;
  passwordHash?: string;
  passwordVersion?: number;
}

/**
 * Look up the share link by token and load the redacted snapshot.
 * Caller is responsible for separately checking the cookie/password before
 * acting on `password_required`.
 */
export async function getPublicAccountSnapshot(
  token: string
): Promise<SnapshotLookupResult> {
  const [link] = await db
    .select()
    .from(accountShareLinks)
    .where(eq(accountShareLinks.token, token))
    .limit(1);

  if (!link) return { status: "not_found" };
  if (!link.isActive) return { status: "inactive" };

  const [accountRow] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      goals: accounts.goals,
      startDate: accounts.startDate,
      serviceScope: accounts.serviceScope,
      industry: accounts.industry,
      location: accounts.location,
      companyDescription: accounts.companyDescription,
      websiteUrl: accounts.websiteUrl,
      linkedinUrl: accounts.linkedinUrl,
      clientSummary: accounts.clientSummary,
      lastActivityAt: accounts.lastActivityAt,
      ownerId: accounts.ownerId,
      workspaceId: accounts.workspaceId,
      enabledModules: accounts.enabledModules,
    })
    .from(accounts)
    .where(eq(accounts.id, link.accountId))
    .limit(1);

  if (!accountRow) return { status: "not_found" };

  const [workspaceRow] = await db
    .select({ name: workspaces.name, logoUrl: workspaces.logoUrl })
    .from(workspaces)
    .where(eq(workspaces.id, accountRow.workspaceId))
    .limit(1);

  let ownerName: string | null = null;
  if (accountRow.ownerId) {
    const [u] = await db
      .select({ fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, accountRow.ownerId))
      .limit(1);
    ownerName = u?.fullName ?? u?.email ?? null;
  }

  const config = coerceShareConfig(link.shareConfig);

  // Per-section loaders, only when enabled. Run in parallel.
  const [
    lastMeetingData,
    filesData,
    tasksData,
    participantsData,
    signalsData,
    crmData,
    healthData,
    paidMediaData,
  ] = await Promise.all([
    config.lastMeeting
      ? db
          .select({
            title: transcripts.title,
            meetingDate: transcripts.meetingDate,
            meetingSummary: transcripts.meetingSummary,
          })
          .from(transcripts)
          .where(eq(transcripts.accountId, accountRow.id))
          .orderBy(desc(transcripts.meetingDate), desc(transcripts.createdAt))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    config.files
      ? db
          .select({
            title: contextDocuments.title,
            docType: contextDocuments.docType,
            createdAt: contextDocuments.createdAt,
          })
          .from(contextDocuments)
          .where(eq(contextDocuments.accountId, accountRow.id))
          .orderBy(desc(contextDocuments.createdAt))
          .limit(20)
      : Promise.resolve(null),
    config.tasks
      ? db
          .select({
            title: tasks.title,
            status: tasks.status,
            dueDate: tasks.dueDate,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.accountId, accountRow.id),
              inArray(tasks.status, ["pending", "in_progress"])
            )
          )
          .orderBy(desc(tasks.createdAt))
          .limit(20)
      : Promise.resolve(null),
    config.participants
      ? db
          .select({ name: participants.name, role: participants.role })
          .from(participants)
          .where(eq(participants.accountId, accountRow.id))
          .orderBy(desc(participants.appearanceCount))
          .limit(20)
      : Promise.resolve(null),
    config.signals
      ? db
          .select({
            type: signals.type,
            description: signals.description,
            createdAt: signals.createdAt,
          })
          .from(signals)
          .where(
            and(
              eq(signals.accountId, accountRow.id),
              eq(signals.status, "active"),
              inArray(signals.type, [
                "upsell_opportunity",
                "growth_opportunity",
              ])
            )
          )
          .orderBy(desc(signals.createdAt))
          .limit(20)
      : Promise.resolve(null),
    config.crm ? loadCrmForAccount(accountRow.id) : Promise.resolve(null),
    config.health
      ? db
          .select({
            weekStart: accountHealthHistory.weekStart,
            signal: accountHealthHistory.signal,
          })
          .from(accountHealthHistory)
          .where(eq(accountHealthHistory.accountId, accountRow.id))
          .orderBy(desc(accountHealthHistory.weekStart))
          .limit(12)
      : Promise.resolve(null),
    config.paidMedia
      ? loadPaidMediaForAccount(accountRow.id)
      : Promise.resolve(null),
  ]);

  // Best-effort view tracking (non-awaited, ignore failures).
  void db
    .update(accountShareLinks)
    .set({
      viewCount: link.viewCount + 1,
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(accountShareLinks.id, link.id))
    .catch(() => {});

  const snapshot: PublicAccountSnapshot = {
    share: {
      token: link.token,
      requiresPassword: !!link.passwordHash,
      passwordVersion: link.passwordVersion,
      isActive: link.isActive,
    },
    workspace: {
      name: workspaceRow?.name ?? "",
      logoUrl: workspaceRow?.logoUrl ?? null,
    },
    account: {
      id: accountRow.id,
      name: accountRow.name,
      industry: accountRow.industry,
      ownerName,
      lastActivityAt: accountRow.lastActivityAt,
    },
    config,
    data: {
      summary: config.summary
        ? { clientSummary: accountRow.clientSummary }
        : null,
      context: config.context
        ? {
            goals: accountRow.goals,
            startDate: accountRow.startDate,
            serviceScope: accountRow.serviceScope,
            industry: accountRow.industry,
            location: accountRow.location,
            companyDescription: accountRow.companyDescription,
            websiteUrl: accountRow.websiteUrl,
            linkedinUrl: accountRow.linkedinUrl,
          }
        : null,
      lastMeeting: lastMeetingData,
      files: filesData,
      tasks: tasksData,
      participants: participantsData,
      signals: signalsData,
      crm: crmData,
      health: healthData,
      paidMedia: paidMediaData,
    },
  };

  return {
    status: link.passwordHash ? "password_required" : "ok",
    snapshot,
    shareLinkId: link.id,
    passwordHash: link.passwordHash ?? undefined,
    passwordVersion: link.passwordVersion,
  };
}

async function loadCrmForAccount(accountId: string) {
  const [deal] = await db
    .select({
      pipelineId: crmDeals.pipelineId,
      stageId: crmDeals.stageId,
    })
    .from(crmDeals)
    .where(eq(crmDeals.accountId, accountId))
    .orderBy(desc(crmDeals.updatedAt))
    .limit(1);
  if (!deal || !deal.pipelineId || !deal.stageId) {
    return { pipeline: null, stage: null };
  }
  const [stage] = await db
    .select({ name: crmStages.name })
    .from(crmStages)
    .where(eq(crmStages.id, deal.stageId))
    .limit(1);
  const [pipeline] = await db
    .select({ name: crmPipelines.name })
    .from(crmPipelines)
    .where(eq(crmPipelines.id, deal.pipelineId))
    .limit(1);
  return {
    pipeline: pipeline?.name ?? null,
    stage: stage?.name ?? null,
  };
}

async function loadPaidMediaForAccount(accountId: string) {
  const adAccountRows = await db
    .select({ id: metaAdAccounts.id })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.accountId, accountId));
  const adAccountIds = adAccountRows.map((r) => r.id);
  if (adAccountIds.length === 0) {
    return {
      campaigns: [],
      ads: [],
      kpis: { spend: 0, impressions: 0, clicks: 0 },
    };
  }

  const [campaigns, ads, insightsRows] = await Promise.all([
    db
      .select({
        id: metaCampaigns.id,
        name: metaCampaigns.name,
        publicName: metaCampaigns.publicName,
        status: metaCampaigns.status,
      })
      .from(metaCampaigns)
      .where(inArray(metaCampaigns.adAccountId, adAccountIds)),
    db
      .select({
        id: metaAds.id,
        campaignId: metaAds.campaignId,
        name: metaAds.name,
        publicName: metaAds.publicName,
        status: metaAds.status,
        thumbnailUrl: metaAds.thumbnailUrl,
      })
      .from(metaAds)
      .where(inArray(metaAds.adAccountId, adAccountIds)),
    db
      .select({
        spend: metaInsightsDaily.spend,
        impressions: metaInsightsDaily.impressions,
        clicks: metaInsightsDaily.clicks,
      })
      .from(metaInsightsDaily)
      .where(
        and(
          inArray(metaInsightsDaily.adAccountId, adAccountIds),
          gte(
            metaInsightsDaily.day,
            new Date(Date.now() - 30 * 86400_000)
              .toISOString()
              .slice(0, 10)
          )
        )
      ),
  ]);

  const kpis = insightsRows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend ?? 0);
      acc.impressions += Number(r.impressions ?? 0);
      acc.clicks += Number(r.clicks ?? 0);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0 }
  );

  return {
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.publicName ?? c.name,
      status: c.status,
    })),
    ads: ads.map((a) => ({
      id: a.id,
      campaignId: a.campaignId,
      name: a.publicName ?? a.name,
      status: a.status,
      thumbnailUrl: a.thumbnailUrl,
    })),
    kpis,
  };
}
```

> **Note:** the column `workspaces.logoUrl` may not exist yet. If type-check fails on it, replace `logoUrl: workspaces.logoUrl` with `logoUrl: sql<string | null>\`null\`` (using a sql placeholder import) — logo support is then deferred to a follow-up. The header component will render gracefully when `logoUrl` is null.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS. If it fails on `workspaces.logoUrl`, apply the workaround in the note above and re-run. If it fails on any other column, locate the actual column name in that schema file and adjust.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/public-account.ts
git commit -m "feat(share): redaction-aware getPublicAccountSnapshot loader"
```

---

### Task 5: Server actions for share link management

**Files:**
- Create: `app/actions/share-links.ts`

- [ ] **Step 1: Write the actions file**

Write `app/actions/share-links.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/drizzle/db";
import { accountShareLinks, accounts } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceMember } from "@/lib/queries/workspace";
import { generateShareToken } from "@/lib/share/token";
import { hashSharePassword } from "@/lib/share/password";
import {
  DEFAULT_SHARE_CONFIG,
  coerceShareConfig,
  type ShareConfig,
} from "@/lib/share/share-config";

async function assertCanManageShareLink(
  userId: string,
  accountId: string
): Promise<string> {
  const [acc] = await db
    .select({ workspaceId: accounts.workspaceId, ownerId: accounts.ownerId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!acc) throw new Error("Cuenta no encontrada");
  const member = await getWorkspaceMember(acc.workspaceId, userId);
  if (!member) throw new Error("Sin acceso al workspace");
  if (
    member.role !== "owner" &&
    member.role !== "admin" &&
    acc.ownerId !== userId
  ) {
    throw new Error("Sin permisos para esta cuenta");
  }
  return acc.workspaceId;
}

export async function createShareLink(accountId: string): Promise<{ token: string }> {
  const userId = await requireUserId();
  await assertCanManageShareLink(userId, accountId);

  // Re-use existing if any; otherwise create fresh.
  const [existing] = await db
    .select()
    .from(accountShareLinks)
    .where(eq(accountShareLinks.accountId, accountId))
    .limit(1);
  if (existing) {
    revalidatePath(`/app/accounts/${accountId}`);
    return { token: existing.token };
  }

  const token = generateShareToken();
  await db.insert(accountShareLinks).values({
    accountId,
    token,
    shareConfig: { ...DEFAULT_SHARE_CONFIG },
  });
  revalidatePath(`/app/accounts/${accountId}`);
  return { token };
}

export async function updateShareConfig(
  shareLinkId: string,
  partial: Partial<ShareConfig>
): Promise<void> {
  const userId = await requireUserId();
  const [link] = await db
    .select({ accountId: accountShareLinks.accountId, shareConfig: accountShareLinks.shareConfig })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  const merged = coerceShareConfig({ ...link.shareConfig, ...partial });
  await db
    .update(accountShareLinks)
    .set({ shareConfig: merged, updatedAt: new Date() })
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
}

export async function setSharePassword(
  shareLinkId: string,
  password: string | null
): Promise<void> {
  const userId = await requireUserId();
  const [link] = await db
    .select({
      accountId: accountShareLinks.accountId,
      passwordVersion: accountShareLinks.passwordVersion,
    })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  const passwordHash =
    password && password.trim().length > 0
      ? await hashSharePassword(password)
      : null;
  await db
    .update(accountShareLinks)
    .set({
      passwordHash,
      passwordVersion: link.passwordVersion + 1,
      updatedAt: new Date(),
    })
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
}

export async function regenerateShareToken(
  shareLinkId: string
): Promise<{ token: string }> {
  const userId = await requireUserId();
  const [link] = await db
    .select({
      accountId: accountShareLinks.accountId,
      passwordVersion: accountShareLinks.passwordVersion,
    })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  const token = generateShareToken();
  await db
    .update(accountShareLinks)
    .set({
      token,
      passwordVersion: link.passwordVersion + 1,
      updatedAt: new Date(),
    })
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
  return { token };
}

export async function toggleShareLinkActive(
  shareLinkId: string,
  isActive: boolean
): Promise<void> {
  const userId = await requireUserId();
  const [link] = await db
    .select({ accountId: accountShareLinks.accountId })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  await db
    .update(accountShareLinks)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
}

export async function deleteShareLink(shareLinkId: string): Promise<void> {
  const userId = await requireUserId();
  const [link] = await db
    .select({ accountId: accountShareLinks.accountId })
    .from(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId))
    .limit(1);
  if (!link) throw new Error("Link no encontrado");
  await assertCanManageShareLink(userId, link.accountId);
  await db
    .delete(accountShareLinks)
    .where(eq(accountShareLinks.id, shareLinkId));
  revalidatePath(`/app/accounts/${link.accountId}`);
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/actions/share-links.ts
git commit -m "feat(share): server actions for managing share links"
```

---

### Task 6: Agency-side share config UI

**Files:**
- Create: `components/account-share-section.tsx`
- Modify: `app/(protected)/app/accounts/[accountId]/page.tsx`

- [ ] **Step 1: Write the section component**

Write `components/account-share-section.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Copy, RefreshCw, Trash2, Check, Eye } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import {
  createShareLink,
  updateShareConfig,
  setSharePassword,
  regenerateShareToken,
  toggleShareLinkActive,
  deleteShareLink,
} from "@/app/actions/share-links";
import {
  DEFAULT_SHARE_CONFIG,
  SHARE_CONFIG_LABELS,
  type ShareConfig,
} from "@/lib/share/share-config";

interface ExistingLink {
  id: string;
  token: string;
  isActive: boolean;
  hasPassword: boolean;
  shareConfig: ShareConfig;
  viewCount: number;
  lastAccessedAt: Date | null;
}

interface Props {
  accountId: string;
  existing: ExistingLink | null;
}

function formatRelative(d: Date | null): string {
  if (!d) return "sin visitas";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} días`;
}

export function AccountShareSection({ accountId, existing }: Props) {
  const [isOpen, setIsOpen] = useState(!!existing);
  const [link, setLink] = useState<ExistingLink | null>(existing);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  const publicUrl = link
    ? `${typeof window !== "undefined" ? window.location.origin : "https://nao.fyi"}/c/${link.token}`
    : "";

  function withAction<T>(name: string, fn: () => Promise<T>): void {
    setPendingAction(name);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function handleGenerate() {
    withAction("create", async () => {
      const { token } = await createShareLink(accountId);
      setLink({
        id: "", // hydrated on next page load
        token,
        isActive: true,
        hasPassword: false,
        shareConfig: { ...DEFAULT_SHARE_CONFIG },
        viewCount: 0,
        lastAccessedAt: null,
      });
      setIsOpen(true);
    });
  }

  async function handleToggleConfig(key: keyof ShareConfig, value: boolean) {
    if (!link?.id) return;
    const next = { ...link.shareConfig, [key]: value };
    setLink({ ...link, shareConfig: next });
    withAction(`config-${key}`, () =>
      updateShareConfig(link.id, { [key]: value })
    );
  }

  async function handleSetPassword() {
    if (!link?.id) return;
    withAction("password", async () => {
      await setSharePassword(link.id, passwordInput || null);
      setLink({ ...link, hasPassword: !!passwordInput });
      setPasswordInput("");
      setShowPasswordInput(false);
    });
  }

  async function handleClearPassword() {
    if (!link?.id) return;
    withAction("password", async () => {
      await setSharePassword(link.id, null);
      setLink({ ...link, hasPassword: false });
    });
  }

  async function handleRegenerate() {
    if (!link?.id) return;
    if (
      !confirm(
        "¿Regenerar el link? El link actual deja de funcionar inmediatamente."
      )
    )
      return;
    withAction("regenerate", async () => {
      const { token } = await regenerateShareToken(link.id);
      setLink({ ...link, token });
    });
  }

  async function handleToggleActive() {
    if (!link?.id) return;
    withAction("active", async () => {
      const next = !link.isActive;
      await toggleShareLinkActive(link.id, next);
      setLink({ ...link, isActive: next });
    });
  }

  async function handleDelete() {
    if (!link?.id) return;
    if (!confirm("¿Eliminar el link? No se puede deshacer.")) return;
    withAction("delete", async () => {
      await deleteShareLink(link.id);
      setLink(null);
      setIsOpen(false);
    });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!link) {
    return (
      <GlassCard className="p-6 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold mb-1 flex items-center gap-2">
              <Eye size={16} aria-hidden /> Vista pública
            </h2>
            <p className="text-sm text-muted-foreground">
              El cliente accede a un dashboard read-only de su cuenta vía un
              link único.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pendingAction === "create"}
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {pendingAction === "create" ? "Generando..." : "Generar link público"}
          </button>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Eye size={16} aria-hidden /> Vista pública
        </h2>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {isOpen ? "Contraer" : "Expandir"}
        </button>
      </div>

      {isOpen && (
        <div className="space-y-5">
          {/* URL + copy */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center rounded-md border border-border px-2.5 py-2 text-xs hover:bg-accent transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={link.isActive}
              onChange={handleToggleActive}
              disabled={pendingAction === "active"}
            />
            <span>Activo (si está pausado, el link devuelve 404)</span>
          </label>

          {/* Password */}
          <div>
            <p className="text-sm font-medium mb-2">Contraseña</p>
            {link.hasPassword ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Contraseña configurada
                </span>
                <button
                  type="button"
                  onClick={() => setShowPasswordInput((v) => !v)}
                  className="text-xs underline"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={handleClearPassword}
                  disabled={pendingAction === "password"}
                  className="text-xs underline text-destructive"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPasswordInput((v) => !v)}
                className="text-xs underline"
              >
                Setear contraseña
              </button>
            )}
            {showPasswordInput && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Nueva contraseña"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleSetPassword}
                  disabled={
                    pendingAction === "password" || passwordInput.length < 4
                  }
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            )}
          </div>

          {/* Module visibility */}
          <div>
            <p className="text-sm font-medium mb-2">Módulos visibles</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(SHARE_CONFIG_LABELS) as Array<keyof ShareConfig>).map(
                (k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={link.shareConfig[k]}
                      onChange={(e) => handleToggleConfig(k, e.target.checked)}
                      disabled={pendingAction === `config-${k}`}
                    />
                    <span>{SHARE_CONFIG_LABELS[k]}</span>
                  </label>
                )
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="text-xs text-muted-foreground">
            {link.viewCount} visita{link.viewCount !== 1 ? "s" : ""} · última:{" "}
            {formatRelative(link.lastAccessedAt)}
          </div>

          {/* Danger zone */}
          <div className="pt-4 [border-top:1px_solid_var(--glass-border)] flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={pendingAction === "regenerate"}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <RefreshCw size={12} /> Regenerar token
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pendingAction === "delete"}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2.5 py-1.5 text-xs hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 2: Wire it into the account detail page**

In `app/(protected)/app/accounts/[accountId]/page.tsx`:

Add the import near the other component imports:

```tsx
import { AccountShareSection } from "@/components/account-share-section";
import { db } from "@/lib/drizzle/db";
import { accountShareLinks } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { coerceShareConfig } from "@/lib/share/share-config";
```

After the line `if (!account) notFound();` and before `const isEditing = ...`, add:

```tsx
  const [shareLinkRow] = await db
    .select()
    .from(accountShareLinks)
    .where(eq(accountShareLinks.accountId, accountId))
    .limit(1);
  const existingShareLink = shareLinkRow
    ? {
        id: shareLinkRow.id,
        token: shareLinkRow.token,
        isActive: shareLinkRow.isActive,
        hasPassword: !!shareLinkRow.passwordHash,
        shareConfig: coerceShareConfig(shareLinkRow.shareConfig),
        viewCount: shareLinkRow.viewCount,
        lastAccessedAt: shareLinkRow.lastAccessedAt,
      }
    : null;
```

Then mount the section between the header div and the AI Summary card. Find the closing `</div>` of the header block followed by `{/* Edit form */}`. Insert immediately before `{/* Edit form */}`:

```tsx
      <AccountShareSection
        accountId={accountId}
        existing={existingShareLink}
      />
```

- [ ] **Step 3: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Smoke test in dev**

Run `npm run dev`, open an account in `/app/accounts/{id}`, expand "Vista pública", click "Generar link público". Verify:
- URL appears, copy button works
- Toggle each module checkbox — no errors
- Set a password (4+ chars), verify "Contraseña configurada" appears
- "Regenerar token" changes the URL
- "Eliminar" removes the section back to the empty state

- [ ] **Step 5: Commit**

```bash
git add components/account-share-section.tsx app/(protected)/app/accounts/[accountId]/page.tsx
git commit -m "feat(share): agency-side share config UI in account detail"
```

---

### Task 7: Public route + password gate

**Files:**
- Create: `app/(public)/c/[token]/layout.tsx`
- Create: `app/(public)/c/[token]/password-gate.tsx`
- Create: `app/(public)/c/[token]/page.tsx`
- Create: `app/(public)/c/[token]/not-found.tsx`

- [ ] **Step 1: Layout (minimal shell, noindex)**

Write `app/(public)/c/[token]/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PublicShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 404 page**

Write `app/(public)/c/[token]/not-found.tsx`:

```tsx
export default function NotFoundPublic() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Link no disponible</h1>
        <p className="text-sm text-muted-foreground">
          Este link fue desactivado o no existe. Contactá a tu agencia para
          obtener uno nuevo.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Password gate component**

Write `app/(public)/c/[token]/password-gate.tsx`:

```tsx
"use client";

import { useFormStatus } from "react-dom";
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  token: string;
  error?: string;
  action: (formData: FormData) => Promise<void>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Verificando..." : "Entrar"}
    </button>
  );
}

export function PasswordGate({ token, error, action }: Props) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <GlassCard className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold mb-1">Vista privada</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Ingresá la contraseña que te dio tu agencia.
        </p>
        <form action={action} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <input
            type="password"
            name="password"
            required
            autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <SubmitButton />
        </form>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 4: Public page (server component)**

Write `app/(public)/c/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  decodeShareCookie,
  encodeShareCookie,
  shareCookieName,
  SHARE_COOKIE_TTL_MS,
} from "@/lib/share/cookie";
import {
  isRateLimited,
  recordPasswordAttempt,
  verifySharePassword,
} from "@/lib/share/password";
import { getPublicAccountSnapshot } from "@/lib/queries/public-account";
import { PasswordGate } from "./password-gate";
import { PublicAccountView } from "@/components/public-account-view/header";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ wrong?: string; locked?: string }>;
}

export default async function PublicSharePage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;

  const result = await getPublicAccountSnapshot(token);
  if (result.status === "not_found" || result.status === "inactive") {
    notFound();
  }

  // No password set → render directly.
  if (!result.passwordHash) {
    return <PublicAccountView snapshot={result.snapshot!} />;
  }

  // Password set → check signed cookie.
  const jar = await cookies();
  const cookieValue = jar.get(shareCookieName(token))?.value;
  if (cookieValue) {
    const decoded = decodeShareCookie(cookieValue);
    if (
      decoded &&
      decoded.token === token &&
      decoded.passwordVersion === result.passwordVersion
    ) {
      return <PublicAccountView snapshot={result.snapshot!} />;
    }
  }

  let error: string | undefined;
  if (sp.wrong) error = "Contraseña incorrecta.";
  if (sp.locked)
    error = "Demasiados intentos. Probá de nuevo en unos minutos.";

  async function verify(formData: FormData) {
    "use server";
    const submitted = (formData.get("password") as string) || "";
    const tk = (formData.get("token") as string) || "";
    if (!tk) return;
    const limited = isRateLimited(tk);
    if (limited.limited) {
      redirect(`/c/${tk}?locked=1`);
    }
    const fresh = await getPublicAccountSnapshot(tk);
    if (fresh.status === "not_found" || fresh.status === "inactive") {
      redirect(`/c/${tk}`);
    }
    if (!fresh.passwordHash) {
      redirect(`/c/${tk}`);
    }
    const ok = await verifySharePassword(submitted, fresh.passwordHash!);
    recordPasswordAttempt(tk, ok);
    if (!ok) redirect(`/c/${tk}?wrong=1`);
    const cookieJar = await cookies();
    cookieJar.set({
      name: shareCookieName(tk),
      value: encodeShareCookie({
        token: tk,
        passwordVersion: fresh.passwordVersion!,
        exp: Date.now() + SHARE_COOKIE_TTL_MS,
      }),
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SHARE_COOKIE_TTL_MS / 1000,
      path: `/c/${tk}`,
    });
    redirect(`/c/${tk}`);
  }

  return <PasswordGate token={token} error={error} action={verify} />;
}
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: ERRORS expected — `PublicAccountView` does not exist yet (that's Task 8). The build still won't pass either; we're going section by section.

Skip the failing type-check this commit and proceed; it's resolved at the end of Task 8.

- [ ] **Step 6: Commit (knowingly broken intermediate state)**

```bash
git add app/(public)/c/
git commit -m "feat(share): public route shell + password gate (WIP)"
```

> The next task introduces `PublicAccountView` — only at the end of Task 8 will type-check pass again. This is a deliberate intermediate commit so each task remains reviewable.

---

### Task 8: Public view sections

**Files:**
- Create: `components/public-account-view/header.tsx` (hosts `PublicAccountView`)
- Create: `components/public-account-view/summary-section.tsx`
- Create: `components/public-account-view/context-section.tsx`
- Create: `components/public-account-view/last-meeting-section.tsx`
- Create: `components/public-account-view/files-section.tsx`
- Create: `components/public-account-view/tasks-section.tsx`
- Create: `components/public-account-view/participants-section.tsx`
- Create: `components/public-account-view/signals-section.tsx`
- Create: `components/public-account-view/health-section.tsx`
- Create: `components/public-account-view/crm-section.tsx`
- Create: `components/public-account-view/paid-media-section.tsx`

- [ ] **Step 1: Header + main view**

Write `components/public-account-view/header.tsx`:

```tsx
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import type { PublicAccountSnapshot } from "@/lib/queries/public-account";
import { SummarySection } from "./summary-section";
import { ContextSection } from "./context-section";
import { LastMeetingSection } from "./last-meeting-section";
import { FilesSection } from "./files-section";
import { TasksSection } from "./tasks-section";
import { ParticipantsSection } from "./participants-section";
import { SignalsSection } from "./signals-section";
import { HealthSection } from "./health-section";
import { CrmSection } from "./crm-section";
import { PaidMediaSection } from "./paid-media-section";

interface Props {
  snapshot: PublicAccountSnapshot;
}

function formatRelative(d: Date | null): string {
  if (!d) return "sin actividad reciente";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "actualizado hoy";
  if (days < 7) return `actualizado hace ${days} día${days !== 1 ? "s" : ""}`;
  const weeks = Math.floor(days / 7);
  return `actualizado hace ${weeks} semana${weeks !== 1 ? "s" : ""}`;
}

export function PublicAccountView({ snapshot }: Props) {
  const { workspace, account, config, data } = snapshot;
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <p className="text-xs text-muted-foreground">{workspace.name}</p>
        <h1 className="text-3xl font-semibold">{account.name}</h1>
        <p className="text-sm text-muted-foreground">
          {account.industry && <>{account.industry} · </>}
          {account.ownerName ? `Tu equipo: ${account.ownerName}` : null}
        </p>
      </header>

      {config.summary && data.summary && (
        <SummarySection clientSummary={data.summary.clientSummary} />
      )}
      {config.context && data.context && (
        <ContextSection data={data.context} />
      )}
      {config.lastMeeting && data.lastMeeting && (
        <LastMeetingSection data={data.lastMeeting} />
      )}
      {config.tasks && data.tasks && <TasksSection rows={data.tasks} />}
      {config.participants && data.participants && (
        <ParticipantsSection rows={data.participants} />
      )}
      {config.signals && data.signals && (
        <SignalsSection rows={data.signals} />
      )}
      {config.crm && data.crm && <CrmSection data={data.crm} />}
      {config.health && data.health && <HealthSection rows={data.health} />}
      {config.files && data.files && <FilesSection rows={data.files} />}
      {config.paidMedia && data.paidMedia && (
        <PaidMediaSection data={data.paidMedia} />
      )}

      <footer className="pt-8 mt-8 [border-top:1px_solid_var(--glass-border)] text-center space-y-1">
        <p className="text-xs text-muted-foreground">
          {formatRelative(account.lastActivityAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          Hecho con{" "}
          <Link href="https://nao.fyi" className="underline">
            nao.fyi
          </Link>
        </p>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Summary section**

Write `components/public-account-view/summary-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";
import { RichMarkdown } from "@/components/ui/rich-markdown";

interface Props {
  clientSummary: string | null;
}

export function SummarySection({ clientSummary }: Props) {
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Resumen</h2>
      {clientSummary ? (
        <div className="text-sm">
          <RichMarkdown text={clientSummary} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Estamos preparando el resumen de tu cuenta. Volvé en unos minutos.
        </p>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 3: Context section**

Write `components/public-account-view/context-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  data: {
    goals: string | null;
    startDate: string | null;
    serviceScope: string | null;
    industry: string | null;
    location: string | null;
    companyDescription: string | null;
    websiteUrl: string | null;
    linkedinUrl: string | null;
  };
}

export function ContextSection({ data }: Props) {
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-4">Contexto</h2>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        {data.goals && (
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Objetivos
            </p>
            <p>{data.goals}</p>
          </div>
        )}
        {data.serviceScope && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Servicios
            </p>
            <p>{data.serviceScope}</p>
          </div>
        )}
        {data.startDate && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Desde
            </p>
            <p>
              {new Date(data.startDate).toLocaleDateString("es-AR", {
                year: "numeric",
                month: "long",
              })}
            </p>
          </div>
        )}
        {data.location && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Ubicación
            </p>
            <p>{data.location}</p>
          </div>
        )}
        {data.companyDescription && (
          <p className="sm:col-span-2 text-muted-foreground pt-2 [border-top:1px_solid_var(--glass-border)]">
            {data.companyDescription}
          </p>
        )}
        {(data.websiteUrl || data.linkedinUrl) && (
          <div className="sm:col-span-2 flex gap-2 pt-2">
            {data.websiteUrl && (
              <a
                href={data.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                Web
              </a>
            )}
            {data.linkedinUrl && (
              <a
                href={data.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                LinkedIn
              </a>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 4: Last meeting section**

Write `components/public-account-view/last-meeting-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";
import { RichMarkdown } from "@/components/ui/rich-markdown";

interface Props {
  data: {
    title: string;
    meetingDate: Date | null;
    meetingSummary: string | null;
  };
}

export function LastMeetingSection({ data }: Props) {
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-1">Última reunión</h2>
      <p className="text-xs text-muted-foreground mb-3">
        {data.title}
        {data.meetingDate && (
          <>
            {" · "}
            {new Date(data.meetingDate).toLocaleDateString("es-AR", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </>
        )}
      </p>
      {data.meetingSummary ? (
        <div className="text-sm">
          <RichMarkdown text={data.meetingSummary} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          El resumen de esta reunión todavía está procesándose.
        </p>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 5: Files section**

Write `components/public-account-view/files-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ title: string; docType: string; createdAt: Date }>;
}

export function FilesSection({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-3">Archivos</h2>
        <p className="text-sm text-muted-foreground">
          Tu equipo todavía no subió documentos de contexto.
        </p>
      </GlassCard>
    );
  }
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Archivos</h2>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li
            key={`${r.title}-${r.createdAt.toISOString()}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="truncate">{r.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(r.createdAt).toLocaleDateString("es-AR")}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
```

- [ ] **Step 6: Tasks section**

Write `components/public-account-view/tasks-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ title: string; status: string; dueDate: string | null }>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
};

export function TasksSection({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-3">Tareas en curso</h2>
        <p className="text-sm text-muted-foreground">
          No hay tareas pendientes ahora mismo.
        </p>
      </GlassCard>
    );
  }
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Tareas en curso</h2>
      <ul className="space-y-2 text-sm">
        {rows.map((r, i) => (
          <li
            key={`${r.title}-${i}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="truncate">{r.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {STATUS_LABEL[r.status] ?? r.status}
              {r.dueDate &&
                ` · ${new Date(r.dueDate).toLocaleDateString("es-AR", {
                  month: "short",
                  day: "numeric",
                })}`}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
```

- [ ] **Step 7: Participants section**

Write `components/public-account-view/participants-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ name: string; role: string | null }>;
}

export function ParticipantsSection({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Participantes</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="font-medium">{r.name}</span>
            {r.role && (
              <span className="text-xs text-muted-foreground">{r.role}</span>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
```

- [ ] **Step 8: Signals section (positive only — already filtered upstream)**

Write `components/public-account-view/signals-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ type: string; description: string | null; createdAt: Date }>;
}

const TYPE_LABEL: Record<string, string> = {
  upsell_opportunity: "Oportunidad de upsell",
  growth_opportunity: "Oportunidad de crecimiento",
};

export function SignalsSection({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Oportunidades detectadas</h2>
      <ul className="space-y-3 text-sm">
        {rows.map((r, i) => (
          <li key={i}>
            <p className="font-medium">{TYPE_LABEL[r.type] ?? r.type}</p>
            {r.description && (
              <p className="text-muted-foreground">{r.description}</p>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
```

- [ ] **Step 9: Health section (chart only — no justifications)**

Write `components/public-account-view/health-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  rows: Array<{ weekStart: Date; signal: string | null }>;
}

const COLOR: Record<string, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#dc2626",
  inactive: "#94a3b8",
};

export function HealthSection({ rows }: Props) {
  if (rows.length === 0) return null;
  // Reverse so oldest is on the left.
  const sorted = [...rows].reverse();
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">Evolución de la cuenta</h2>
      <div className="flex items-end gap-1 h-12">
        {sorted.map((r, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              backgroundColor: COLOR[r.signal ?? "inactive"] ?? COLOR.inactive,
              height: "100%",
            }}
            title={new Date(r.weekStart).toLocaleDateString("es-AR")}
          />
        ))}
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 10: CRM section**

Write `components/public-account-view/crm-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  data: { pipeline: string | null; stage: string | null };
}

export function CrmSection({ data }: Props) {
  if (!data.pipeline && !data.stage) return null;
  return (
    <GlassCard className="p-6">
      <h2 className="font-semibold mb-3">CRM</h2>
      <p className="text-sm">
        {data.pipeline && <>Pipeline: <strong>{data.pipeline}</strong></>}
        {data.pipeline && data.stage && " · "}
        {data.stage && <>Etapa: <strong>{data.stage}</strong></>}
      </p>
    </GlassCard>
  );
}
```

- [ ] **Step 11: Paid media section**

Write `components/public-account-view/paid-media-section.tsx`:

```tsx
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  data: {
    campaigns: Array<{ id: string; name: string; status: string }>;
    ads: Array<{
      id: string;
      campaignId: string;
      name: string;
      status: string;
      thumbnailUrl: string | null;
    }>;
    kpis: { spend: number; impressions: number; clicks: number };
  };
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function PaidMediaSection({ data }: Props) {
  if (data.campaigns.length === 0 && data.ads.length === 0) return null;
  return (
    <GlassCard className="p-6 space-y-4">
      <h2 className="font-semibold">Paid media (últimos 30 días)</h2>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Inversión</p>
          <p className="text-lg font-semibold">{formatMoney(data.kpis.spend)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Impresiones</p>
          <p className="text-lg font-semibold">
            {formatNumber(data.kpis.impressions)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Clicks</p>
          <p className="text-lg font-semibold">
            {formatNumber(data.kpis.clicks)}
          </p>
        </div>
      </div>
      {data.campaigns.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Campañas activas</h3>
          <ul className="space-y-1 text-sm">
            {data.campaigns
              .filter((c) => c.status === "ACTIVE")
              .map((c) => (
                <li key={c.id} className="truncate">
                  {c.name}
                </li>
              ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 12: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS now that all `<*Section>` components exist and `PublicAccountView` is wired.

- [ ] **Step 13: Commit**

```bash
git add components/public-account-view/
git commit -m "feat(share): public view sections with redacted data"
```

- [ ] **Step 14: Smoke test in dev**

`npm run dev` → from the agency side, generate a share link for an account with data. Open the URL in an incognito window. Verify:
- Page loads, shows what's enabled
- Disabled sections don't appear
- Set a password from the agency side → incognito open shows password gate
- Wrong password → error message, attempt counter
- 5 wrong in a row → "demasiados intentos"
- Correct password → cookie sets, content shows; refresh stays logged in
- Change password from agency side → incognito refresh forces re-auth (passwordVersion bump invalidates old cookie)
- Toggle "Activo" off → page returns 404

---

### Task 9: Paid media `public_name` rename UI

**Files:**
- Create: `components/paid-media/public-name-editor.tsx`
- Modify: `app/actions/share-links.ts` (add 2 new actions)
- Modify: `components/paid-media/campaigns-section.tsx`
- Modify: `components/paid-media/ads-section.tsx`

- [ ] **Step 1: Add the rename actions to `share-links.ts`**

In `app/actions/share-links.ts`, append the two new actions at the bottom:

```ts
import { metaCampaigns, metaAds, metaAdAccounts } from "@/lib/drizzle/schema";

async function assertCanRenameMetaEntity(
  userId: string,
  adAccountId: string
): Promise<void> {
  const [adAcc] = await db
    .select({ accountId: metaAdAccounts.accountId })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, adAccountId))
    .limit(1);
  if (!adAcc?.accountId) throw new Error("Ad account no encontrado");
  await assertCanManageShareLink(userId, adAcc.accountId);
}

export async function setPublicCampaignName(
  campaignId: string,
  publicName: string | null
): Promise<void> {
  const userId = await requireUserId();
  const [c] = await db
    .select({ adAccountId: metaCampaigns.adAccountId })
    .from(metaCampaigns)
    .where(eq(metaCampaigns.id, campaignId))
    .limit(1);
  if (!c) throw new Error("Campaña no encontrada");
  await assertCanRenameMetaEntity(userId, c.adAccountId);
  const trimmed = publicName?.trim() || null;
  await db
    .update(metaCampaigns)
    .set({ publicName: trimmed, updatedAt: new Date() })
    .where(eq(metaCampaigns.id, campaignId));
}

export async function setPublicAdName(
  adId: string,
  publicName: string | null
): Promise<void> {
  const userId = await requireUserId();
  const [a] = await db
    .select({ adAccountId: metaAds.adAccountId })
    .from(metaAds)
    .where(eq(metaAds.id, adId))
    .limit(1);
  if (!a) throw new Error("Anuncio no encontrado");
  await assertCanRenameMetaEntity(userId, a.adAccountId);
  const trimmed = publicName?.trim() || null;
  await db
    .update(metaAds)
    .set({ publicName: trimmed, updatedAt: new Date() })
    .where(eq(metaAds.id, adId));
}
```

> Note: the existing imports list at the top of the file already has `metaCampaigns`, `metaAds`, and `metaAdAccounts` if they were not — add them to that single import statement.

- [ ] **Step 2: Inline editor component**

Write `components/paid-media/public-name-editor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";

interface Props {
  entityId: string;
  internalName: string;
  initialPublicName: string | null;
  onSave: (entityId: string, publicName: string | null) => Promise<void>;
}

export function PublicNameEditor({
  entityId,
  internalName,
  initialPublicName,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialPublicName ?? "");
  const [current, setCurrent] = useState(initialPublicName);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  function commit() {
    startTransition(async () => {
      setPending(true);
      try {
        const trimmed = value.trim();
        await onSave(entityId, trimmed.length > 0 ? trimmed : null);
        setCurrent(trimmed.length > 0 ? trimmed : null);
        setEditing(false);
      } finally {
        setPending(false);
      }
    });
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(current ?? "");
              setEditing(false);
            }
          }}
          placeholder="Nombre público"
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={commit}
          disabled={pending}
          className="text-primary"
          aria-label="Guardar"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(current ?? "");
            setEditing(false);
          }}
          className="text-muted-foreground"
          aria-label="Cancelar"
        >
          <X size={12} />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0">
      <span className="inline-flex items-center gap-1">
        <span>{internalName}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
          aria-label="Editar nombre público"
        >
          <Pencil size={11} />
        </button>
      </span>
      {current && (
        <span className="text-[10px] text-muted-foreground">
          Público: {current}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Wire into campaigns-section**

In `components/paid-media/campaigns-section.tsx`, locate the JSX rendering each campaign row's name (typically a `<td>` or `<span>` displaying `campaign.name`). Replace that element with `<PublicNameEditor />`. Add the import:

```tsx
import { PublicNameEditor } from "@/components/paid-media/public-name-editor";
import { setPublicCampaignName } from "@/app/actions/share-links";
```

If the section currently renders a server component, the `PublicNameEditor` must be inside a client wrapper or the section itself converted to use `"use client"` for the row that contains the editor. The simplest path: keep the section a server component but have the row be a client subcomponent that takes `id`, `name`, `publicName`. Look at the existing structure and apply whichever pattern the file already uses; both work since `setPublicCampaignName` is a server action callable from a client component. Wrap the name with `<span className="group">` so the pencil's hover-to-show works:

```tsx
<span className="group">
  <PublicNameEditor
    entityId={campaign.id}
    internalName={campaign.name}
    initialPublicName={campaign.publicName}
    onSave={setPublicCampaignName}
  />
</span>
```

Also extend whatever query fetches campaigns to select `publicName` from `metaCampaigns`. Search the file for the `db.select(...).from(metaCampaigns)` block and add `publicName: metaCampaigns.publicName` to the select.

- [ ] **Step 4: Wire into ads-section**

Same pattern in `components/paid-media/ads-section.tsx`. Import `setPublicAdName`, wrap each ad's name with `<PublicNameEditor>`, extend the query to select `publicName: metaAds.publicName`.

- [ ] **Step 5: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 6: Smoke test**

In `npm run dev`, open an account with paid media data. Hover a campaign row → pencil appears. Click → input appears, type "Brasil Prospección", Enter. Public caption "Público: Brasil Prospección" appears below the original name. Open the share link in incognito → that campaign now shows "Brasil Prospección".

- [ ] **Step 7: Commit**

```bash
git add components/paid-media/public-name-editor.tsx components/paid-media/campaigns-section.tsx components/paid-media/ads-section.tsx app/actions/share-links.ts
git commit -m "feat(paid-media): inline rename for public-facing campaign + ad names"
```

---

### Task 10: Extend summary task to produce `clientSummary`

**Files:**
- Modify: `lib/ai/account-summary.ts`
- Modify: `trigger/tasks/refresh-account-summary.ts`
- Modify: `trigger/tasks/generate-summary.ts`

- [ ] **Step 1: Extend the schema in `account-summary.ts`**

Replace the `SummarySchema` definition:

```ts
const SummarySchema = z.object({
  meetingSummary: z.string(),
  accountSituation: z.string(),
  clientSummary: z.string(),
});
```

Update the type export accordingly — `AccountSummaryOutput` automatically gains the field.

- [ ] **Step 2: Extend the prompt**

In `runAccountSummaryGeneration`, locate the prompt's closing JSON schema:

```
Respondé SOLO con JSON válido (strings con \\n para saltos de línea):
{"meetingSummary": "...", "accountSituation": "..."}
```

Replace with:

```
Respondé SOLO con JSON válido (strings con \\n para saltos de línea):
{"meetingSummary": "...", "accountSituation": "...", "clientSummary": "..."}
```

And immediately before that closing block, add a third instruction section:

```
3. "clientSummary" — VERSIÓN PARA EL CLIENTE FINAL (no para el equipo interno). Tono presente, hechos avanzados sin ansiedades internas, sin críticas. Estilo: "Esta semana avanzamos en X", "Tenemos pendiente Y", "Coordinamos Z para la próxima semana". Sin emojis. NUNCA menciones señales de riesgo, salud de cuenta, métricas internas ni nombres del equipo de la agencia. 2-4 oraciones, prosa simple. Si la información disponible no alcanza para un resumen genuino, devolvé "Tu cuenta sigue activa. Te traemos una actualización completa pronto."
```

- [ ] **Step 3: Update the fallback in the catch block**

Find the existing `catch` returning `{ meetingSummary: text, accountSituation: text }`. Update it to include `clientSummary`:

```ts
  } catch {
    return {
      meetingSummary: text,
      accountSituation: text,
      clientSummary:
        "Tu cuenta sigue activa. Te traemos una actualización completa pronto.",
    };
  }
```

- [ ] **Step 4: Update `refresh-account-summary.ts` to persist clientSummary**

In `trigger/tasks/refresh-account-summary.ts`, modify the UPDATE on `accounts`:

```ts
    await db
      .update(accounts)
      .set({
        aiSummary: parsed.accountSituation,
        aiSummaryUpdatedAt: new Date(),
        clientSummary: parsed.clientSummary,
        clientSummaryUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, payload.accountId));
```

- [ ] **Step 5: Update `generate-summary.ts` return type**

In `trigger/tasks/generate-summary.ts`, the `GenerateSummaryOutput` interface must include `clientSummary` for downstream tasks that consume it. Replace:

```ts
interface GenerateSummaryOutput {
  meetingSummary: string;
  accountSituation: string;
}
```

With:

```ts
interface GenerateSummaryOutput {
  meetingSummary: string;
  accountSituation: string;
  clientSummary: string;
}
```

- [ ] **Step 6: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 7: Deploy Trigger.dev tasks**

The push to master will trigger `.github/workflows/trigger-deploy.yml` automatically once the next commit lands. For local dev verification:

Run: `npx trigger.dev@latest deploy`
Expected: deploy succeeds; the new task version is live.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/account-summary.ts trigger/tasks/refresh-account-summary.ts trigger/tasks/generate-summary.ts
git commit -m "feat(summary): add clientSummary field for public client view"
```

- [ ] **Step 9: Backfill existing accounts (manual ops)**

For any account that already has transcripts processed but no `client_summary` yet, trigger a refresh:
1. Open the account in `/app/accounts/{id}`
2. Edit + save (or use the Trigger.dev dashboard to fire `refresh-account-summary` for that account)
3. Wait ~30s and verify `accounts.client_summary` is populated

Or batch via the Trigger.dev MCP if there are >5 accounts.

---

### Task 11: End-to-end verification

**Files:** None.

- [ ] **Step 1: Full type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Add SHARE_LINK_SECRET to Vercel**

In Vercel project → Environment Variables, add `SHARE_LINK_SECRET` (same value as the local one or a new generated one — but pick one and stick with it). Mark as Production + Preview + Development. Save.

- [ ] **Step 4: Push and let Vercel deploy**

```bash
git push
```

Wait for Vercel deploy to finish. Check the deployment URL or `nao.fyi` is live with the new build.

- [ ] **Step 5: End-to-end smoke**

1. Open an account in production at `https://nao.fyi/app/accounts/{id}`.
2. Generate share link → copy URL.
3. Set password "test1234".
4. Toggle off "Salud" and "Señales", toggle on "Contexto".
5. Rename one campaign to a client-friendly name.
6. Open share URL in incognito or another browser.
7. Enter "test1234" → see content. Verify:
   - Header shows account name + workspace + owner
   - "Resumen" shows `clientSummary` (if generated)
   - "Contexto" appears (since toggled on)
   - "Salud" does NOT appear
   - "Señales" does NOT appear
   - Paid media shows the renamed campaign
8. Refresh the page → still shows content (cookie sticks).
9. Close incognito, reopen → password gate re-asks (expected: cookies are window-scoped in some incognito modes, OK).
10. From agency side, change password to "different5678" → incognito refresh forces re-auth.
11. Disable the link → URL returns 404 page.

- [ ] **Step 6: Memory + final commit (no code changes expected)**

If everything works, no further commits are needed. Update the project memory entry to reflect that the public client view has shipped.

---

## Self-Review

**Spec coverage:**
- ✅ URL `/c/{token}` outside protected group (Task 7)
- ✅ Token + password optional (Tasks 2, 5, 7)
- ✅ Module visibility per cuenta with conservative defaults (Tasks 3, 5, 6)
- ✅ Paid media `public_name` overrides + edit UI (Tasks 2, 9)
- ✅ Separate `clientSummary` generated in same LLM call (Task 10)
- ✅ Redaction-aware loader as single boundary (Task 4)
- ✅ Password rotation invalidates old cookies via `password_version` (Tasks 3, 5, 7)
- ✅ noindex + nofollow (Task 7 layout)
- ✅ View tracking (`view_count`, `last_accessed_at`) — fire-and-forget in Task 4
- ✅ Rate limit on password attempts (Task 3)
- ✅ Permissions on agency-side actions (Task 5)
- ✅ Paid media filters: `public_name ?? name`, no change events, no variants (Task 4 only loads campaigns + ads + 30-day insights aggregate)

**Placeholder scan:** No TBDs or TODOs in implementation steps. The note in Task 4 about `workspaces.logoUrl` is concrete: a fallback is provided.

**Type consistency:**
- `ShareConfig` keys match between `lib/share/share-config.ts`, `getPublicAccountSnapshot`, the agency UI's checkboxes, and the `<PublicAccountView>` conditional rendering. ✅
- `PublicAccountSnapshot.data.{section}` shape matches each `<*Section>` component's `Props.data`/`Props.rows`. ✅
- `setPublicCampaignName` and `setPublicAdName` signatures match the `onSave` prop of `<PublicNameEditor>`. ✅
- `clientSummary` field added consistently in `SummarySchema`, `GenerateSummaryOutput`, the `accounts` schema, and the `refreshAccountSummary` UPDATE. ✅
- `passwordVersion` is bumped in `setSharePassword` AND `regenerateShareToken`, and verified in the cookie decode in `app/(public)/c/[token]/page.tsx`. ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-public-client-view.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
