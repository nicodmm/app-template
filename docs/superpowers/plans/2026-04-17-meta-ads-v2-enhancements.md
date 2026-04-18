# Meta Ads v2 Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six enhancements to the Meta Ads / Paid Media module — ad-level sync, clickable KPI charts with period-over-period comparison, change-history log, unified table filter, and two label renames.

**Architecture:** Three new Drizzle tables (ads, ad insights, change events), two new sync helpers wired into the existing hourly `sync-single-ad-account` Trigger.dev task, a label utility shared across components, five new UI components (chart modal, ads table, ad drawer, change timeline, plus extended campaign drawer), and five new query helpers. All changes follow the existing codebase conventions: Drizzle for DB, `@trigger.dev/sdk/v3` for workflows, server actions for data fetching, Tailwind + shadcn patterns for UI.

**Tech Stack:** Next.js 15 App Router · React 19 · Drizzle ORM · Supabase Postgres · Trigger.dev v3 · recharts · Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-04-17-meta-ads-v2-enhancements-design.md`

**Project convention (locked):** No automated test infrastructure. Verification is manual via `npm run type-check`, browser smoke tests, and Trigger.dev dashboard log inspection.

---

## Task 1: Schema — three new tables + migration

**Files:**
- Create: `lib/drizzle/schema/meta_ads.ts`
- Create: `lib/drizzle/schema/meta_ad_insights_daily.ts`
- Create: `lib/drizzle/schema/meta_change_events.ts`
- Modify: `lib/drizzle/schema/index.ts`
- Create: `drizzle/migrations/0006_<generated-name>.sql` (generated)
- Create: `drizzle/migrations/0006_<generated-name>/down.sql`

- [ ] **Step 1: Create `meta_ads` schema file**

Write `lib/drizzle/schema/meta_ads.ts`:

```ts
import { pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";
import { metaCampaigns } from "./meta_campaigns";

export const metaAds = pgTable(
  "meta_ads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => metaCampaigns.id, { onDelete: "cascade" }),
    metaAdId: text("meta_ad_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    creativeId: text("creative_id"),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meta_ads_campaign_idx").on(table.campaignId),
    uniqueIndex("meta_ads_unique_idx").on(table.adAccountId, table.metaAdId),
  ]
);

export type MetaAd = typeof metaAds.$inferSelect;
export type NewMetaAd = typeof metaAds.$inferInsert;
```

- [ ] **Step 2: Create `meta_ad_insights_daily` schema file**

Write `lib/drizzle/schema/meta_ad_insights_daily.ts`:

```ts
import { pgTable, timestamp, uuid, integer, date, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";
import { metaCampaigns } from "./meta_campaigns";
import { metaAds } from "./meta_ads";

export const metaAdInsightsDaily = pgTable(
  "meta_ad_insights_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    adId: uuid("ad_id")
      .notNull()
      .references(() => metaAds.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => metaCampaigns.id, { onDelete: "cascade" }),
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
    uniqueIndex("meta_ad_insights_daily_unique_idx").on(
      table.adAccountId,
      table.adId,
      table.date
    ),
    index("meta_ad_insights_daily_ad_account_date_idx").on(table.adAccountId, table.date),
    index("meta_ad_insights_daily_campaign_date_idx").on(table.campaignId, table.date),
  ]
);

export type MetaAdInsightDaily = typeof metaAdInsightsDaily.$inferSelect;
export type NewMetaAdInsightDaily = typeof metaAdInsightsDaily.$inferInsert;
```

- [ ] **Step 3: Create `meta_change_events` schema file**

Write `lib/drizzle/schema/meta_change_events.ts`:

```ts
import { pgTable, text, timestamp, uuid, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { metaAdAccounts } from "./meta_ad_accounts";

export const metaChangeEvents = pgTable(
  "meta_change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // 'campaign' | 'ad_set' | 'ad'
    entityMetaId: text("entity_meta_id").notNull(),
    entityLocalId: uuid("entity_local_id"), // soft FK to meta_campaigns.id or meta_ads.id; null for ad_set
    eventType: text("event_type").notNull(),
    eventData: jsonb("event_data").notNull(),
    rawActivity: jsonb("raw_activity").notNull(),
    parentCampaignMetaId: text("parent_campaign_meta_id"), // populated for ad_set events
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_change_events_unique_idx").on(
      table.adAccountId,
      table.entityMetaId,
      table.eventType,
      table.occurredAt
    ),
    index("meta_change_events_timeline_idx").on(table.adAccountId, table.occurredAt),
    index("meta_change_events_entity_idx").on(table.entityType, table.entityMetaId),
    index("meta_change_events_parent_campaign_idx").on(table.entityType, table.parentCampaignMetaId),
  ]
);

export type MetaChangeEvent = typeof metaChangeEvents.$inferSelect;
export type NewMetaChangeEvent = typeof metaChangeEvents.$inferInsert;
```

- [ ] **Step 4: Add exports to schema index**

Append to `lib/drizzle/schema/index.ts` (after the `meta_insights_daily` export on line 14):

```ts
export * from "./meta_ads";
export * from "./meta_ad_insights_daily";
export * from "./meta_change_events";
```

- [ ] **Step 5: Generate migration**

Run: `npm run db:generate`
Expected: Drizzle prints a file path like `drizzle/migrations/0006_<generated-name>.sql`. Note the exact name — you will need it for the down migration directory.

- [ ] **Step 6: Create the down migration**

Create the directory matching the generated migration name, then write `drizzle/migrations/0006_<name>/down.sql`:

```sql
DROP TABLE IF EXISTS "meta_change_events";
DROP TABLE IF EXISTS "meta_ad_insights_daily";
DROP TABLE IF EXISTS "meta_ads";
```

- [ ] **Step 7: Run migration**

Run: `npm run db:migrate`
Expected: all three tables created successfully; `npm run db:status` shows migration as applied.

- [ ] **Step 8: Verify with type-check**

Run: `npm run type-check`
Expected: exit code 0, no errors.

- [ ] **Step 9: Commit**

```bash
git add lib/drizzle/schema/meta_ads.ts lib/drizzle/schema/meta_ad_insights_daily.ts lib/drizzle/schema/meta_change_events.ts lib/drizzle/schema/index.ts drizzle/migrations/0006_*
git commit -m "feat(meta-v2): schema for ads, ad insights, change events"
```

---

## Task 2: Label utility + apply to existing components

**Files:**
- Create: `lib/meta/labels.ts`
- Modify: `components/paid-media-mini-card.tsx`
- Modify: `components/paid-media-campaigns-table.tsx`
- Modify: `components/paid-media-campaign-drawer.tsx`
- Modify: `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx`

- [ ] **Step 1: Create label utility**

Write `lib/meta/labels.ts`:

```ts
export function getPaidMediaLabels(isEcommerce: boolean) {
  return {
    spend: "Inversión",
    conversions: isEcommerce ? "Ventas" : "Leads",
    cpa: isEcommerce ? "CPA" : "CPL",
    impressions: "Impresiones",
    reach: "Alcance",
    clicks: "Clicks",
    ctr: "CTR",
    cpm: "CPM",
    frequency: "Frecuencia",
    roas: "ROAS",
  } as const;
}

export type PaidMediaLabels = ReturnType<typeof getPaidMediaLabels>;
```

- [ ] **Step 2: Apply labels in paid-media page**

In `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx`:

Add import at the top with the other imports:

```ts
import { getPaidMediaLabels } from "@/lib/meta/labels";
```

After the existing `currency` line (~line 104), add:

```ts
const labels = getPaidMediaLabels(state.adAccount.isEcommerce);
```

Replace the hardcoded KPI card labels in the JSX:

- `label="Spend"` → `label={labels.spend}`
- `label="Impresiones"` → `label={labels.impressions}` (unchanged value but use labels for consistency)
- `label="Alcance"` → `label={labels.reach}`
- `label="Clicks"` → `label={labels.clicks}`
- `label="CTR"` → `label={labels.ctr}`
- `label="CPM"` → `label={labels.cpm}`
- `label="Conversiones"` → `label={labels.conversions}`
- `label={state.adAccount.isEcommerce ? "CPA" : "CPL"}` → `label={labels.cpa}`
- `label="Frecuencia"` → `label={labels.frequency}`
- `label="ROAS"` → `label={labels.roas}`

Also update the `"Campañas"` heading (~line 198) to remain unchanged (no label change needed).

- [ ] **Step 3: Apply labels in mini-card**

Open `components/paid-media-mini-card.tsx`. Add the import:

```ts
import { getPaidMediaLabels } from "@/lib/meta/labels";
```

Inside the component body, after receiving props, compute:

```ts
const labels = getPaidMediaLabels(isEcommerce);
```

Replace any hardcoded `"Spend"` label with `{labels.spend}` and any `"Conversiones"` label with `{labels.conversions}`.

- [ ] **Step 4: Apply labels in campaigns table**

Open `components/paid-media-campaigns-table.tsx`. Add the import:

```ts
import { getPaidMediaLabels } from "@/lib/meta/labels";
```

Inside the component body:

```ts
const labels = getPaidMediaLabels(isEcommerce);
```

Replace column headers:

- `"Spend"` → `{labels.spend}` or `labels.spend`
- `"Conversiones"` → `{labels.conversions}`
- `"CPA"`/`"CPL"` conditional → `{labels.cpa}`

- [ ] **Step 5: Apply labels in campaign drawer**

Open `components/paid-media-campaign-drawer.tsx`. Add the import and compute labels the same way. Replace the same three label strings (`Spend`, `Conversiones`, `CPA`/`CPL`).

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev` (in a separate terminal). Open `/app/accounts/<id>/paid-media` in the browser. Verify:
- KPI cards show "Inversión", "Leads" (if non-ecommerce account) or "Ventas" (if ecommerce account)
- Campaigns table header shows "Inversión" and "Leads"/"Ventas"
- Mini-card on the parent account page shows the same labels

- [ ] **Step 8: Commit**

```bash
git add lib/meta/labels.ts components/paid-media-mini-card.tsx components/paid-media-campaigns-table.tsx components/paid-media-campaign-drawer.tsx "app/(protected)/app/accounts/[accountId]/paid-media/page.tsx"
git commit -m "feat(meta-v2): rename Spend→Inversión, Conversiones→Leads/Ventas"
```

---

## Task 3: `sync-ads.ts` helper

**Files:**
- Create: `lib/meta/sync-ads.ts`

- [ ] **Step 1: Write the helper file**

Write `lib/meta/sync-ads.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  metaAds,
  metaAdInsightsDaily,
} from "@/lib/drizzle/schema";
import { metaGraphFetch } from "./client";

type AdApi = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  creative?: { id: string };
};

type InsightAction = { action_type: string; value: string };

type AdInsightApiRow = {
  date_start: string;
  ad_id?: string;
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

function extractConversions(actions: InsightAction[] | undefined, event: string): number {
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

export async function fetchAndUpsertAds(
  adAccountRowId: string,
  metaAdAccountId: string,
  accessToken: string,
  campaignIdMap: Map<string, string>
): Promise<Map<string, string>> {
  const result = await metaGraphFetch<{ data: AdApi[] }>(
    `/${metaAdAccountId}/ads`,
    {
      accessToken,
      searchParams: {
        fields: "id,name,status,creative{id},campaign_id",
        limit: 500,
      },
    }
  );

  const metaToLocalId = new Map<string, string>();
  const now = new Date();

  for (const ad of result.data) {
    const localCampaignId = campaignIdMap.get(ad.campaign_id);
    if (!localCampaignId) continue; // campaign not synced yet, skip

    const existing = await db
      .select({ id: metaAds.id })
      .from(metaAds)
      .where(and(eq(metaAds.adAccountId, adAccountRowId), eq(metaAds.metaAdId, ad.id)))
      .limit(1);

    const values = {
      adAccountId: adAccountRowId,
      campaignId: localCampaignId,
      metaAdId: ad.id,
      name: ad.name,
      status: ad.status,
      creativeId: ad.creative?.id ?? null,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (existing.length > 0) {
      await db.update(metaAds).set(values).where(eq(metaAds.id, existing[0].id));
      metaToLocalId.set(ad.id, existing[0].id);
    } else {
      const inserted = await db.insert(metaAds).values(values).returning({ id: metaAds.id });
      metaToLocalId.set(ad.id, inserted[0].id);
    }
  }

  return metaToLocalId;
}

export async function fetchAndUpsertAdInsights(params: {
  adAccountRowId: string;
  metaAdAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  conversionEvent: string;
  isEcommerce: boolean;
  adIdMap: Map<string, string>; // metaAdId -> localAdId
  campaignIdMap: Map<string, string>; // metaCampaignId -> localCampaignId
}): Promise<number> {
  const result = await metaGraphFetch<{ data: AdInsightApiRow[] }>(
    `/${params.metaAdAccountId}/insights`,
    {
      accessToken: params.accessToken,
      searchParams: {
        level: "ad",
        time_increment: 1,
        time_range: JSON.stringify({ since: params.since, until: params.until }),
        fields:
          "ad_id,campaign_id,spend,impressions,reach,clicks,frequency,actions,action_values",
        limit: 500,
      },
    }
  );

  let upserts = 0;
  for (const row of result.data) {
    if (!row.ad_id || !row.campaign_id || !row.date_start) continue;
    const localAdId = params.adIdMap.get(row.ad_id);
    const localCampaignId = params.campaignIdMap.get(row.campaign_id);
    if (!localAdId || !localCampaignId) continue;

    const values = {
      adAccountId: params.adAccountRowId,
      adId: localAdId,
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
      .insert(metaAdInsightsDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [
          metaAdInsightsDaily.adAccountId,
          metaAdInsightsDaily.adId,
          metaAdInsightsDaily.date,
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
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add lib/meta/sync-ads.ts
git commit -m "feat(meta-v2): sync-ads helper (ads + ad-level daily insights)"
```

---

## Task 4: `sync-changes.ts` helper

**Files:**
- Create: `lib/meta/sync-changes.ts`

- [ ] **Step 1: Write the helper file**

Write `lib/meta/sync-changes.ts`:

```ts
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaChangeEvents, metaCampaigns, metaAds } from "@/lib/drizzle/schema";
import { metaGraphFetch } from "./client";

// Maps Meta's raw event_type to our normalized {entityType, eventType} tuple.
// Anything not in this map is dropped.
const EVENT_MAP: Record<string, { entityType: "campaign" | "ad_set" | "ad"; eventType: string }> = {
  // Campaign-level (Meta uses "campaign_group" for what we call campaign)
  create_campaign_group: { entityType: "campaign", eventType: "campaign_created" },
  update_campaign_group_status: { entityType: "campaign", eventType: "campaign_status_change" },
  update_campaign_group_budget: { entityType: "campaign", eventType: "campaign_budget_change" },
  update_campaign_name: { entityType: "campaign", eventType: "campaign_name_change" },
  update_campaign_schedule: { entityType: "campaign", eventType: "campaign_schedule_change" },
  update_campaign_objective: { entityType: "campaign", eventType: "campaign_objective_change" },
  delete_campaign_group: { entityType: "campaign", eventType: "campaign_deleted" },
  // Ad set-level (Meta uses "campaign" for what we call ad_set)
  create_campaign: { entityType: "ad_set", eventType: "ad_set_created" },
  update_campaign_targeting: { entityType: "ad_set", eventType: "ad_set_targeting_change" },
  update_campaign_budget: { entityType: "ad_set", eventType: "ad_set_budget_change" },
  update_campaign_run_status: { entityType: "ad_set", eventType: "ad_set_status_change" },
  delete_campaign: { entityType: "ad_set", eventType: "ad_set_deleted" },
  // Ad-level
  create_ad: { entityType: "ad", eventType: "ad_created" },
  update_ad_status: { entityType: "ad", eventType: "ad_status_change" },
  update_ad_creative: { entityType: "ad", eventType: "ad_creative_change" },
  update_ad_run_status: { entityType: "ad", eventType: "ad_run_status_change" },
  delete_ad: { entityType: "ad", eventType: "ad_deleted" },
};

type ActivityApiRow = {
  event_type: string;
  event_time: string; // ISO timestamp
  object_id?: string;
  object_type?: string;
  object_name?: string;
  actor_id?: string;
  actor_name?: string;
  extra_data?: string; // JSON string from Meta
};

type AdSetParentCacheEntry = string | null; // campaign_id or null if not found

async function resolveAdSetParent(
  adSetMetaId: string,
  accessToken: string,
  cache: Map<string, AdSetParentCacheEntry>
): Promise<string | null> {
  if (cache.has(adSetMetaId)) return cache.get(adSetMetaId) ?? null;
  try {
    const data = await metaGraphFetch<{ id: string; campaign_id?: string }>(
      `/${adSetMetaId}`,
      {
        accessToken,
        searchParams: { fields: "campaign_id" },
      }
    );
    const parent = data.campaign_id ?? null;
    cache.set(adSetMetaId, parent);
    return parent;
  } catch {
    cache.set(adSetMetaId, null);
    return null;
  }
}

async function resolveLocalId(
  entityType: "campaign" | "ad_set" | "ad",
  entityMetaId: string,
  adAccountRowId: string
): Promise<string | null> {
  if (entityType === "campaign") {
    const rows = await db
      .select({ id: metaCampaigns.id })
      .from(metaCampaigns)
      .where(
        and(
          eq(metaCampaigns.adAccountId, adAccountRowId),
          eq(metaCampaigns.metaCampaignId, entityMetaId)
        )
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }
  if (entityType === "ad") {
    const rows = await db
      .select({ id: metaAds.id })
      .from(metaAds)
      .where(and(eq(metaAds.adAccountId, adAccountRowId), eq(metaAds.metaAdId, entityMetaId)))
      .limit(1);
    return rows[0]?.id ?? null;
  }
  return null; // ad_set has no local table
}

function parseExtraData(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _unparseable: raw };
  }
}

export async function fetchAndUpsertChangeEvents(
  adAccountRowId: string,
  metaAdAccountId: string,
  accessToken: string,
  since: Date
): Promise<number> {
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const result = await metaGraphFetch<{ data: ActivityApiRow[] }>(
    `/${metaAdAccountId}/activities`,
    {
      accessToken,
      searchParams: {
        fields: "event_type,event_time,object_id,object_type,object_name,actor_id,actor_name,extra_data",
        since: sinceUnix,
        limit: 500,
      },
    }
  );

  const parentCache = new Map<string, AdSetParentCacheEntry>();
  let upserts = 0;

  for (const row of result.data) {
    const mapped = EVENT_MAP[row.event_type];
    if (!mapped) continue;
    if (!row.object_id || !row.event_time) continue;

    const entityType = mapped.entityType;
    const entityMetaId = row.object_id;
    const eventType = mapped.eventType;
    const occurredAt = new Date(row.event_time);
    const eventData = parseExtraData(row.extra_data);

    const entityLocalId = await resolveLocalId(entityType, entityMetaId, adAccountRowId);

    let parentCampaignMetaId: string | null = null;
    if (entityType === "ad_set") {
      parentCampaignMetaId = await resolveAdSetParent(entityMetaId, accessToken, parentCache);
    }

    await db
      .insert(metaChangeEvents)
      .values({
        adAccountId: adAccountRowId,
        entityType,
        entityMetaId,
        entityLocalId,
        eventType,
        eventData,
        rawActivity: row,
        parentCampaignMetaId,
        occurredAt,
      })
      .onConflictDoNothing({
        target: [
          metaChangeEvents.adAccountId,
          metaChangeEvents.entityMetaId,
          metaChangeEvents.eventType,
          metaChangeEvents.occurredAt,
        ],
      });
    upserts++;
  }

  return upserts;
}

// Backfill retention: prune events older than 90 days to match insights retention.
export async function pruneOldChangeEvents(adAccountRowId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 86400000);
  await db
    .delete(metaChangeEvents)
    .where(
      and(
        eq(metaChangeEvents.adAccountId, adAccountRowId),
        lt(metaChangeEvents.occurredAt, cutoff)
      )
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add lib/meta/sync-changes.ts
git commit -m "feat(meta-v2): sync-changes helper (/activities endpoint with normalization)"
```

---

## Task 5: Extend `sync-single-ad-account` task

**Files:**
- Modify: `trigger/tasks/sync-single-ad-account.ts`

- [ ] **Step 1: Update the task to call the new helpers**

Replace the entire body of `trigger/tasks/sync-single-ad-account.ts` with:

```ts
import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts, metaConnections } from "@/lib/drizzle/schema";
import {
  fetchAndUpsertCampaigns,
  fetchAndUpsertInsights,
  getAdAccountWithConnection,
} from "@/lib/meta/sync-insights";
import { fetchAndUpsertAds, fetchAndUpsertAdInsights } from "@/lib/meta/sync-ads";
import { fetchAndUpsertChangeEvents, pruneOldChangeEvents } from "@/lib/meta/sync-changes";
import { MetaApiError } from "@/lib/meta/client";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface SyncSingleInput {
  adAccountId: string;
  customRange?: { since: string; until: string };
}

interface SyncResult {
  campaignInsightsUpserted: number;
  adInsightsUpserted: number;
  changeEventsUpserted: number;
}

export const syncSingleAdAccount = task({
  id: "sync-single-ad-account",
  retry: { maxAttempts: 3 },
  maxDuration: 600,
  run: async (payload: SyncSingleInput): Promise<SyncResult> => {
    const row = await getAdAccountWithConnection(payload.adAccountId);
    if (!row) throw new AbortTaskRunError("ad account not found");
    if (row.connectionStatus !== "active") {
      logger.warn("Skipping sync — connection not active", {
        adAccountId: payload.adAccountId,
        status: row.connectionStatus,
      });
      return { campaignInsightsUpserted: 0, adInsightsUpserted: 0, changeEventsUpserted: 0 };
    }

    const accessToken = row.accessToken;
    const metaId = row.adAccount.metaAdAccountId;

    try {
      const campaignMap = await fetchAndUpsertCampaigns(
        payload.adAccountId,
        metaId,
        accessToken
      );

      const adMap = await fetchAndUpsertAds(
        payload.adAccountId,
        metaId,
        accessToken,
        campaignMap
      );

      const today = new Date();
      const range = payload.customRange ?? {
        since: isoDate(new Date(today.getTime() - 3 * 86400000)),
        until: isoDate(today),
      };

      const campaignInsightsUpserted = await fetchAndUpsertInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: range.since,
        until: range.until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        campaignIdMap: campaignMap,
      });

      const adInsightsUpserted = await fetchAndUpsertAdInsights({
        adAccountRowId: payload.adAccountId,
        metaAdAccountId: metaId,
        accessToken,
        since: range.since,
        until: range.until,
        conversionEvent: row.adAccount.conversionEvent,
        isEcommerce: row.adAccount.isEcommerce,
        adIdMap: adMap,
        campaignIdMap: campaignMap,
      });

      // Change events: sync from last 25 hours to cover the hourly sync window
      // with overlap (idempotent via UNIQUE). On first sync this yields recent
      // events only; full 90-day backfill runs in backfill-meta-ads.
      const changeSince = new Date(Date.now() - 25 * 3600 * 1000);
      const changeEventsUpserted = await fetchAndUpsertChangeEvents(
        payload.adAccountId,
        metaId,
        accessToken,
        changeSince
      );

      await pruneOldChangeEvents(payload.adAccountId);

      await db
        .update(metaAdAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(metaAdAccounts.id, payload.adAccountId));

      logger.info("sync complete", {
        adAccountId: payload.adAccountId,
        campaignInsightsUpserted,
        adInsightsUpserted,
        changeEventsUpserted,
      });
      return { campaignInsightsUpserted, adInsightsUpserted, changeEventsUpserted };
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

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add trigger/tasks/sync-single-ad-account.ts
git commit -m "feat(meta-v2): extend hourly sync with ads + ad insights + change events"
```

---

## Task 6: Extend `backfill-meta-ads` task

**Files:**
- Modify: `trigger/tasks/backfill-meta-ads.ts`

- [ ] **Step 1: Read the current file**

Open `trigger/tasks/backfill-meta-ads.ts` to understand its structure (identical to `sync-single-ad-account` but uses a 90-day range instead of 3 days).

- [ ] **Step 2: Update it to the same shape as sync-single-ad-account**

Apply the same changes as Task 5 — inject `fetchAndUpsertAds`, `fetchAndUpsertAdInsights`, and `fetchAndUpsertChangeEvents` — but with two differences:

1. The `range` for insights stays at 90 days (do not change).
2. The `changeSince` passed to `fetchAndUpsertChangeEvents` is **90 days ago**, not 25 hours:

```ts
const changeSince = new Date(Date.now() - 90 * 86400000);
```

The full updated file has the same structure as Task 5's `sync-single-ad-account.ts` with only the range and the `changeSince` adjusted. Keep the task `id` as `backfill-meta-ads` and the existing return type shape.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add trigger/tasks/backfill-meta-ads.ts
git commit -m "feat(meta-v2): extend backfill with ads + 90d change history"
```

---

## Task 7: Campaign filter unification (item 4)

**Files:**
- Modify: `lib/queries/paid-media.ts` (the `getCampaignsWithKpis` function)

- [ ] **Step 1: Add `HAVING` filter**

In `lib/queries/paid-media.ts`, find `getCampaignsWithKpis` (starts around line 200). After `.groupBy(metaCampaigns.id)`, add a `.having` clause. The final builder chain becomes:

```ts
  const rows = await db
    .select({ ... })          // unchanged
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
    .groupBy(metaCampaigns.id)
    .having(
      sql`COALESCE(SUM(${metaInsightsDaily.spend}), 0) > 0 OR COALESCE(SUM(${metaInsightsDaily.conversions}), 0) > 0`
    );
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 3: Manual smoke test**

Start the dev server, open the paid-media page. Confirm the campaigns table shows only rows that had spend or conversions during the selected period. Paused campaigns with past activity should appear; brand-new active campaigns with zero data should not.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/paid-media.ts
git commit -m "feat(meta-v2): filter campaigns table to rows with spend/results > 0"
```

---

## Task 8: Query helpers for ads, timeline, chart modal

**Files:**
- Modify: `lib/queries/paid-media.ts` (add new exports)

- [ ] **Step 1: Add `getActiveAdsWithKpis`**

Append to `lib/queries/paid-media.ts` (after `getCampaignTrend`):

```ts
export type AdRow = {
  id: string;
  metaAdId: string;
  name: string;
  status: string;
  campaignId: string;
  campaignName: string;
  creativeId: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa: number;
};

export async function getActiveAdsWithKpis(
  adAccountId: string,
  since: string,
  until: string
): Promise<AdRow[]> {
  const rows = await db
    .select({
      id: metaAds.id,
      metaAdId: metaAds.metaAdId,
      name: metaAds.name,
      status: metaAds.status,
      campaignId: metaAds.campaignId,
      campaignName: metaCampaigns.name,
      creativeId: metaAds.creativeId,
      spend: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.spend}), 0)::int`,
      impressions: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.impressions}), 0)::int`,
      clicks: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.clicks}), 0)::int`,
      conversions: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.conversions}), 0)::int`,
    })
    .from(metaAds)
    .innerJoin(metaCampaigns, eq(metaCampaigns.id, metaAds.campaignId))
    .leftJoin(
      metaAdInsightsDaily,
      and(
        eq(metaAdInsightsDaily.adId, metaAds.id),
        gte(metaAdInsightsDaily.date, since),
        lte(metaAdInsightsDaily.date, until)
      )
    )
    .where(eq(metaAds.adAccountId, adAccountId))
    .groupBy(metaAds.id, metaCampaigns.name)
    .having(
      sql`COALESCE(SUM(${metaAdInsightsDaily.spend}), 0) > 0 OR COALESCE(SUM(${metaAdInsightsDaily.conversions}), 0) > 0`
    );

  return rows.map((r) => ({
    id: r.id,
    metaAdId: r.metaAdId,
    name: r.name,
    status: r.status,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    creativeId: r.creativeId,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions / 100 : 0,
  }));
}
```

Add the missing imports at the top of the file:

```ts
import { metaAds, metaAdInsightsDaily, metaChangeEvents } from "@/lib/drizzle/schema";
```

(Extend the existing import line rather than creating a new one.)

- [ ] **Step 2: Add `getKpiDailyWithPrevious`**

Append to the same file:

```ts
export type DailyPoint = { date: string; value: number };
export type MetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "conversions"
  | "conversionValue"
  | "frequency"
  | "ctr"
  | "cpm"
  | "cpa"
  | "roas";

export type DailyWithPrevious = {
  current: DailyPoint[];
  previous: DailyPoint[];
  totals: { current: number; previous: number; deltaPct: number | null };
};

function rangeDays(since: string, until: string): number {
  const s = new Date(since).getTime();
  const u = new Date(until).getTime();
  return Math.max(1, Math.round((u - s) / 86400000) + 1);
}

function isoShift(d: string, offsetDays: number): string {
  return new Date(new Date(d).getTime() + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);
}

async function fetchDailyRows(adAccountId: string, since: string, until: string) {
  return db
    .select({
      date: metaInsightsDaily.date,
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
    )
    .groupBy(metaInsightsDaily.date)
    .orderBy(metaInsightsDaily.date);
}

function projectMetric(row: {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  conversionValue: number | null;
  frequency: number;
}, key: MetricKey): number {
  switch (key) {
    case "spend": return row.spend;
    case "impressions": return row.impressions;
    case "reach": return row.reach;
    case "clicks": return row.clicks;
    case "conversions": return row.conversions;
    case "conversionValue": return row.conversionValue ?? 0;
    case "frequency": return row.frequency;
    case "ctr": return row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
    case "cpm": return row.impressions > 0 ? ((row.spend / row.impressions) * 1000) / 100 : 0;
    case "cpa": return row.conversions > 0 ? row.spend / row.conversions / 100 : 0;
    case "roas":
      return row.conversionValue != null && row.spend > 0
        ? row.conversionValue / row.spend
        : 0;
  }
}

export async function getKpiDailyWithPrevious(
  adAccountId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const days = rangeDays(since, until);
  const prevUntil = isoShift(since, -1);
  const prevSince = isoShift(since, -days);

  const [currentRows, previousRows] = await Promise.all([
    fetchDailyRows(adAccountId, since, until),
    fetchDailyRows(adAccountId, prevSince, prevUntil),
  ]);

  const current: DailyPoint[] = currentRows.map((r) => ({
    date: r.date,
    value: projectMetric(r, metric),
  }));
  const previous: DailyPoint[] = previousRows.map((r) => ({
    date: r.date,
    value: projectMetric(r, metric),
  }));

  const totalCurrent = current.reduce((a, b) => a + b.value, 0);
  const totalPrevious = previous.reduce((a, b) => a + b.value, 0);
  const deltaPct =
    totalPrevious === 0
      ? totalCurrent === 0
        ? 0
        : null
      : ((totalCurrent - totalPrevious) / totalPrevious) * 100;

  return {
    current,
    previous,
    totals: { current: totalCurrent, previous: totalPrevious, deltaPct },
  };
}
```

- [ ] **Step 3: Add `getChangeEventsForAdAccount`**

Append:

```ts
export type ChangeEventRow = {
  id: string;
  entityType: "campaign" | "ad_set" | "ad";
  entityMetaId: string;
  entityLocalId: string | null;
  eventType: string;
  eventData: Record<string, unknown>;
  occurredAt: Date;
  entityName: string | null;
  campaignName: string | null;
};

export async function getChangeEventsForAdAccount(
  adAccountId: string,
  since: string,
  until: string,
  limit: number,
  offset: number,
  levelFilter?: "campaign" | "ad_set" | "ad"
): Promise<ChangeEventRow[]> {
  const conditions = [
    eq(metaChangeEvents.adAccountId, adAccountId),
    gte(metaChangeEvents.occurredAt, new Date(since)),
    lte(metaChangeEvents.occurredAt, new Date(new Date(until).getTime() + 86400000 - 1)),
  ];
  if (levelFilter) conditions.push(eq(metaChangeEvents.entityType, levelFilter));

  const rows = await db
    .select({
      id: metaChangeEvents.id,
      entityType: metaChangeEvents.entityType,
      entityMetaId: metaChangeEvents.entityMetaId,
      entityLocalId: metaChangeEvents.entityLocalId,
      eventType: metaChangeEvents.eventType,
      eventData: metaChangeEvents.eventData,
      rawActivity: metaChangeEvents.rawActivity,
      parentCampaignMetaId: metaChangeEvents.parentCampaignMetaId,
      occurredAt: metaChangeEvents.occurredAt,
      campaignName: metaCampaigns.name,
      adName: metaAds.name,
    })
    .from(metaChangeEvents)
    .leftJoin(
      metaCampaigns,
      and(
        eq(metaChangeEvents.entityType, "campaign"),
        eq(metaChangeEvents.entityLocalId, metaCampaigns.id)
      )
    )
    .leftJoin(
      metaAds,
      and(
        eq(metaChangeEvents.entityType, "ad"),
        eq(metaChangeEvents.entityLocalId, metaAds.id)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(metaChangeEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => {
    const raw = r.rawActivity as { object_name?: string } | null;
    const entityName =
      r.entityType === "campaign"
        ? r.campaignName
        : r.entityType === "ad"
        ? r.adName
        : raw?.object_name ?? null;
    return {
      id: r.id,
      entityType: r.entityType as "campaign" | "ad_set" | "ad",
      entityMetaId: r.entityMetaId,
      entityLocalId: r.entityLocalId,
      eventType: r.eventType,
      eventData: r.eventData as Record<string, unknown>,
      occurredAt: r.occurredAt,
      entityName,
      campaignName: r.campaignName,
    };
  });
}
```

- [ ] **Step 4: Add `getChangeEventsForCampaign` and `getAdDailyWithPrevious`**

Append:

```ts
export async function getChangeEventsForCampaign(
  campaignLocalId: string,
  limit: number = 20
): Promise<ChangeEventRow[]> {
  const campaign = await db
    .select({ id: metaCampaigns.id, metaCampaignId: metaCampaigns.metaCampaignId })
    .from(metaCampaigns)
    .where(eq(metaCampaigns.id, campaignLocalId))
    .limit(1);
  if (campaign.length === 0) return [];

  const adIds = await db
    .select({ id: metaAds.id })
    .from(metaAds)
    .where(eq(metaAds.campaignId, campaignLocalId));
  const adIdList = adIds.map((a) => a.id);

  const rows = await db
    .select({
      id: metaChangeEvents.id,
      entityType: metaChangeEvents.entityType,
      entityMetaId: metaChangeEvents.entityMetaId,
      entityLocalId: metaChangeEvents.entityLocalId,
      eventType: metaChangeEvents.eventType,
      eventData: metaChangeEvents.eventData,
      rawActivity: metaChangeEvents.rawActivity,
      occurredAt: metaChangeEvents.occurredAt,
    })
    .from(metaChangeEvents)
    .where(
      or(
        and(
          eq(metaChangeEvents.entityType, "campaign"),
          eq(metaChangeEvents.entityLocalId, campaignLocalId)
        ),
        and(
          eq(metaChangeEvents.entityType, "ad_set"),
          eq(metaChangeEvents.parentCampaignMetaId, campaign[0].metaCampaignId)
        ),
        adIdList.length > 0
          ? and(
              eq(metaChangeEvents.entityType, "ad"),
              inArray(metaChangeEvents.entityLocalId, adIdList)
            )
          : sql`false`
      )
    )
    .orderBy(desc(metaChangeEvents.occurredAt))
    .limit(limit);

  return rows.map((r) => {
    const raw = r.rawActivity as { object_name?: string } | null;
    return {
      id: r.id,
      entityType: r.entityType as "campaign" | "ad_set" | "ad",
      entityMetaId: r.entityMetaId,
      entityLocalId: r.entityLocalId,
      eventType: r.eventType,
      eventData: r.eventData as Record<string, unknown>,
      occurredAt: r.occurredAt,
      entityName: raw?.object_name ?? null,
      campaignName: null,
    };
  });
}

export async function getAdDailyWithPrevious(
  adAccountId: string,
  adId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const days = rangeDays(since, until);
  const prevUntil = isoShift(since, -1);
  const prevSince = isoShift(since, -days);

  async function fetchAdDailyRows(s: string, u: string) {
    return db
      .select({
        date: metaAdInsightsDaily.date,
        spend: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.spend}), 0)::int`,
        impressions: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.impressions}), 0)::int`,
        reach: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.reach}), 0)::int`,
        clicks: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.clicks}), 0)::int`,
        conversions: sql<number>`COALESCE(SUM(${metaAdInsightsDaily.conversions}), 0)::int`,
        conversionValue: sql<number | null>`SUM(${metaAdInsightsDaily.conversionValue})::int`,
        frequency: sql<number>`COALESCE(AVG(${metaAdInsightsDaily.frequency}), 0)::float`,
      })
      .from(metaAdInsightsDaily)
      .where(
        and(
          eq(metaAdInsightsDaily.adAccountId, adAccountId),
          eq(metaAdInsightsDaily.adId, adId),
          gte(metaAdInsightsDaily.date, s),
          lte(metaAdInsightsDaily.date, u)
        )
      )
      .groupBy(metaAdInsightsDaily.date)
      .orderBy(metaAdInsightsDaily.date);
  }

  const [currentRows, previousRows] = await Promise.all([
    fetchAdDailyRows(since, until),
    fetchAdDailyRows(prevSince, prevUntil),
  ]);

  const current = currentRows.map((r) => ({ date: r.date, value: projectMetric(r, metric) }));
  const previous = previousRows.map((r) => ({ date: r.date, value: projectMetric(r, metric) }));
  const totalCurrent = current.reduce((a, b) => a + b.value, 0);
  const totalPrevious = previous.reduce((a, b) => a + b.value, 0);
  const deltaPct =
    totalPrevious === 0
      ? totalCurrent === 0
        ? 0
        : null
      : ((totalCurrent - totalPrevious) / totalPrevious) * 100;

  return { current, previous, totals: { current: totalCurrent, previous: totalPrevious, deltaPct } };
}
```

Add `or`, `inArray` to the imports at the top:

```ts
import { and, eq, sql, gte, lte, desc, or, inArray } from "drizzle-orm";
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add lib/queries/paid-media.ts
git commit -m "feat(meta-v2): queries — active ads, daily with previous period, change events"
```

---

## Task 9: KPI chart modal + server action

**Files:**
- Create: `app/actions/paid-media-chart.ts`
- Create: `components/paid-media-kpi-chart-modal.tsx`
- Modify: `components/paid-media-kpi-card.tsx` (make clickable)

- [ ] **Step 1: Create the server action**

Write `app/actions/paid-media-chart.ts`:

```ts
"use server";

import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getKpiDailyWithPrevious, getAdDailyWithPrevious, type MetricKey, type DailyWithPrevious } from "@/lib/queries/paid-media";
import { db } from "@/lib/drizzle/db";
import { metaAdAccounts } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";

async function assertAdAccountBelongsToWorkspace(adAccountId: string, workspaceId: string): Promise<void> {
  const rows = await db
    .select({ id: metaAdAccounts.id })
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.id, adAccountId), eq(metaAdAccounts.workspaceId, workspaceId)))
    .limit(1);
  if (rows.length === 0) throw new Error("forbidden");
}

export async function getKpiChartData(
  adAccountId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("no workspace");
  await assertAdAccountBelongsToWorkspace(adAccountId, workspace.id);
  return getKpiDailyWithPrevious(adAccountId, since, until, metric);
}

export async function getAdChartData(
  adAccountId: string,
  adId: string,
  since: string,
  until: string,
  metric: MetricKey
): Promise<DailyWithPrevious> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("no workspace");
  await assertAdAccountBelongsToWorkspace(adAccountId, workspace.id);
  return getAdDailyWithPrevious(adAccountId, adId, since, until, metric);
}
```

- [ ] **Step 2: Create the modal component**

Write `components/paid-media-kpi-chart-modal.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getKpiChartData } from "@/app/actions/paid-media-chart";
import type { DailyWithPrevious, MetricKey } from "@/lib/queries/paid-media";

interface Props {
  adAccountId: string;
  since: string;
  until: string;
  metricLabels: Partial<Record<MetricKey, string>>;
  formatValue: (metric: MetricKey, value: number) => string;
}

export function PaidMediaKpiChartModal({ adAccountId, since, until, metricLabels, formatValue }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chartParam = searchParams.get("chart") as MetricKey | null;
  const [data, setData] = useState<DailyWithPrevious | null>(null);
  const [, startTransition] = useTransition();

  const close = () => {
    const qp = new URLSearchParams(searchParams);
    qp.delete("chart");
    router.push(`?${qp.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (!chartParam) {
      setData(null);
      return;
    }
    setData(null);
    startTransition(async () => {
      const d = await getKpiChartData(adAccountId, since, until, chartParam);
      setData(d);
    });
  }, [chartParam, adAccountId, since, until]);

  useEffect(() => {
    if (!chartParam) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartParam]);

  if (!chartParam) return null;

  const label = metricLabels[chartParam] ?? chartParam;

  // Rekey previous series by day-offset-from-start so both align on X axis.
  const merged =
    data?.current.map((c, i) => ({
      date: c.date,
      current: c.value,
      previous: data.previous[i]?.value ?? null,
    })) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{label}</h2>
            {data && (
              <p className="text-sm text-muted-foreground">
                {formatValue(chartParam, data.totals.current)} actual ·{" "}
                {formatValue(chartParam, data.totals.previous)} anterior
                {data.totals.deltaPct != null && (
                  <> · <span className={data.totals.deltaPct >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {data.totals.deltaPct >= 0 ? "+" : ""}{data.totals.deltaPct.toFixed(1)}%
                  </span></>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
          >
            Cerrar
          </button>
        </div>

        <div className="h-80">
          {!data ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Cargando…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merged}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => formatValue(chartParam, v)}
                  labelFormatter={(l) => l}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="Actual"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="Período anterior"
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Make KPI cards clickable**

Open `components/paid-media-kpi-card.tsx`. Add an optional `metricKey` prop that, when present, turns the card into a link to `?chart=<key>`:

```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MetricKey } from "@/lib/queries/paid-media";

interface Props {
  label: string;
  value: string;
  delta: number | null;
  invertColors?: boolean;
  metricKey?: MetricKey;
}

export function PaidMediaKpiCard({ label, value, delta, invertColors, metricKey }: Props) {
  const searchParams = useSearchParams();
  const cardBody = (
    <div
      className={`rounded-xl border border-border bg-card p-3 ${
        metricKey ? "transition-colors hover:bg-accent/40 cursor-pointer" : ""
      }`}
    >
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {delta != null && (
        <div
          className={`text-[11px] mt-0.5 ${
            (invertColors ? -delta : delta) >= 0 ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
        </div>
      )}
    </div>
  );

  if (!metricKey) return cardBody;

  const qp = new URLSearchParams(searchParams);
  qp.set("chart", metricKey);
  return (
    <Link href={`?${qp.toString()}`} scroll={false} aria-label={`Ver gráfico de ${label}`}>
      {cardBody}
    </Link>
  );
}
```

**Note:** If the existing `paid-media-kpi-card.tsx` has a different shape, preserve its existing props and styling; only add `metricKey` + the conditional Link wrapper. The goal is to keep the visual output identical when `metricKey` is not provided.

- [ ] **Step 4: Wire the modal into the dashboard page**

In `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx`, pass `metricKey` to every `<PaidMediaKpiCard>` and mount the modal at the bottom of the return JSX.

Add the imports:

```ts
import { PaidMediaKpiChartModal } from "@/components/paid-media-kpi-chart-modal";
```

For each KPI card, add its `metricKey`:

- Spend card: `metricKey="spend"`
- Impresiones: `metricKey="impressions"`
- Alcance: `metricKey="reach"`
- Clicks: `metricKey="clicks"`
- CTR: `metricKey="ctr"`
- CPM: `metricKey="cpm"`
- Conversiones: `metricKey="conversions"`
- CPA/CPL: `metricKey="cpa"`
- Frecuencia: `metricKey="frequency"`
- ROAS: `metricKey="roas"`

At the end of the returned JSX (just before the closing `</div>` of the outermost wrapper), add:

```tsx
<PaidMediaKpiChartModal
  adAccountId={state.adAccount.id}
  since={since}
  until={until}
  metricLabels={{
    spend: labels.spend,
    impressions: labels.impressions,
    reach: labels.reach,
    clicks: labels.clicks,
    conversions: labels.conversions,
    ctr: labels.ctr,
    cpm: labels.cpm,
    cpa: labels.cpa,
    frequency: labels.frequency,
    roas: labels.roas,
  }}
  formatValue={(metric, v) => {
    if (["spend", "cpm", "cpa"].includes(metric)) return formatMoney(Math.round(v * 100), currency);
    if (metric === "ctr") return `${v.toFixed(2)}%`;
    if (metric === "frequency") return v.toFixed(2);
    if (metric === "roas") return v.toFixed(2) + "x";
    return Math.round(v).toLocaleString("es-AR");
  }}
/>
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 6: Manual smoke test**

Open the paid-media page. Click on each KPI card. Verify:
- Modal opens with the correct metric title
- Line chart renders with 2 series (current solid, previous dashed)
- Header shows current total, previous total, delta %
- Pressing ESC or clicking outside closes it
- URL updates to `?chart=<metric>` and clears on close

- [ ] **Step 7: Commit**

```bash
git add app/actions/paid-media-chart.ts components/paid-media-kpi-chart-modal.tsx components/paid-media-kpi-card.tsx "app/(protected)/app/accounts/[accountId]/paid-media/page.tsx"
git commit -m "feat(meta-v2): clickable KPI cards → chart modal with period-over-period"
```

---

## Task 10: Ads table + ad drawer

**Files:**
- Create: `components/paid-media-ads-table.tsx`
- Create: `components/paid-media-ad-drawer.tsx`

- [ ] **Step 1: Create the ads table**

Write `components/paid-media-ads-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PaidMediaAdDrawer } from "./paid-media-ad-drawer";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import type { AdRow } from "@/lib/queries/paid-media";

interface Props {
  ads: AdRow[];
  currency: string;
  isEcommerce: boolean;
  adAccountId: string;
  since: string;
  until: string;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PaidMediaAdsTable({ ads, currency, isEcommerce, adAccountId, since, until }: Props) {
  const labels = getPaidMediaLabels(isEcommerce);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const selectedAd = selectedAdId ? ads.find((a) => a.id === selectedAdId) ?? null : null;

  const sorted = [...ads].sort((a, b) => b.spend - a.spend);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No hay anuncios con gasto o resultados en el período seleccionado.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Campaña</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium text-right">{labels.spend}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.impressions}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.clicks}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.ctr}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.conversions}</th>
              <th className="px-3 py-2 font-medium text-right">{labels.cpa}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ad) => (
              <tr
                key={ad.id}
                className="border-t border-border hover:bg-accent/30 cursor-pointer"
                onClick={() => setSelectedAdId(ad.id)}
              >
                <td className="px-3 py-2 truncate max-w-xs">{ad.name}</td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-[10rem]">
                  {ad.campaignName}
                </td>
                <td className="px-3 py-2 text-xs">{ad.status}</td>
                <td className="px-3 py-2 text-right">{formatMoney(ad.spend, currency)}</td>
                <td className="px-3 py-2 text-right">{ad.impressions.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-right">{ad.clicks.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-right">{ad.ctr.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right">{ad.conversions}</td>
                <td className="px-3 py-2 text-right">
                  {ad.conversions > 0 ? formatMoney(Math.round(ad.cpa * 100), currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaidMediaAdDrawer
        ad={selectedAd}
        onClose={() => setSelectedAdId(null)}
        adAccountId={adAccountId}
        currency={currency}
        isEcommerce={isEcommerce}
        since={since}
        until={until}
      />
    </>
  );
}
```

- [ ] **Step 2: Create the ad drawer**

Write `components/paid-media-ad-drawer.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getAdChartData } from "@/app/actions/paid-media-chart";
import { getPaidMediaLabels } from "@/lib/meta/labels";
import type { AdRow, DailyWithPrevious } from "@/lib/queries/paid-media";

interface Props {
  ad: AdRow | null;
  onClose: () => void;
  adAccountId: string;
  currency: string;
  isEcommerce: boolean;
  since: string;
  until: string;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PaidMediaAdDrawer({ ad, onClose, adAccountId, currency, isEcommerce, since, until }: Props) {
  const labels = getPaidMediaLabels(isEcommerce);
  const [trend, setTrend] = useState<DailyWithPrevious | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!ad) { setTrend(null); return; }
    setTrend(null);
    startTransition(async () => {
      const d = await getAdChartData(adAccountId, ad.id, since, until, "spend");
      setTrend(d);
    });
  }, [ad, adAccountId, since, until]);

  useEffect(() => {
    if (!ad) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ad, onClose]);

  if (!ad) return null;

  const merged =
    trend?.current.map((c, i) => ({
      date: c.date,
      current: c.value,
      previous: trend.previous[i]?.value ?? null,
    })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex-1 bg-black/50" />
      <aside
        className="w-full max-w-xl overflow-y-auto border-l border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{ad.name}</h2>
            <p className="text-xs text-muted-foreground">
              {ad.campaignName} · {ad.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
          >
            Cerrar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          <Stat label={labels.spend} value={formatMoney(ad.spend, currency)} />
          <Stat label={labels.impressions} value={ad.impressions.toLocaleString("es-AR")} />
          <Stat label={labels.clicks} value={ad.clicks.toLocaleString("es-AR")} />
          <Stat label={labels.ctr} value={`${ad.ctr.toFixed(2)}%`} />
          <Stat label={labels.conversions} value={String(ad.conversions)} />
          <Stat
            label={labels.cpa}
            value={ad.conversions > 0 ? formatMoney(Math.round(ad.cpa * 100), currency) : "—"}
          />
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">{labels.spend} diario</h3>
          <div className="h-52">
            {!trend ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Cargando…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => formatMoney(Math.round(v * 100), currency)} />
                  <Line type="monotone" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="previous"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">Creatividad</h3>
          <p className="text-xs text-muted-foreground">
            Creative ID: {ad.creativeId ?? "—"} (preview no disponible en esta versión)
          </p>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add components/paid-media-ads-table.tsx components/paid-media-ad-drawer.tsx
git commit -m "feat(meta-v2): ads table + ad drawer with spend trend chart"
```

---

## Task 11: Change timeline component

**Files:**
- Create: `components/paid-media-change-timeline.tsx`

- [ ] **Step 1: Create the timeline component**

Write `components/paid-media-change-timeline.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { ChangeEventRow } from "@/lib/queries/paid-media";

interface Props {
  events: ChangeEventRow[];
  totalAvailable: number; // used to show/hide "Ver más"
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

const ENTITY_ICON: Record<string, string> = {
  campaign: "📊",
  ad_set: "🎯",
  ad: "▶️",
};

const LEVEL_LABELS = [
  { value: "all", label: "Todas" },
  { value: "campaign", label: "Campañas" },
  { value: "ad_set", label: "Ad Sets" },
  { value: "ad", label: "Anuncios" },
] as const;

function timeAgo(d: Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} días`;
}

function describeEvent(event: ChangeEventRow): string {
  const data = event.eventData;
  const oldV = (data.old_value as string | undefined) ?? null;
  const newV = (data.new_value as string | undefined) ?? null;
  switch (event.eventType) {
    case "campaign_created": return "campaña creada";
    case "campaign_deleted": return "campaña eliminada";
    case "campaign_status_change": return `estado: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "campaign_budget_change": return `presupuesto: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "campaign_name_change": return `nombre cambiado`;
    case "campaign_schedule_change": return "fechas modificadas";
    case "campaign_objective_change": return `objetivo: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_set_created": return "conjunto creado";
    case "ad_set_deleted": return "conjunto eliminado";
    case "ad_set_targeting_change": return "segmentación modificada";
    case "ad_set_budget_change": return `presupuesto: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_set_status_change": return `estado: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_created": return "anuncio creado";
    case "ad_deleted": return "anuncio eliminado";
    case "ad_status_change": return `estado: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_run_status_change": return `ejecución: ${oldV ?? "?"} → ${newV ?? "?"}`;
    case "ad_creative_change": return "creatividad modificada";
    default: return event.eventType;
  }
}

export function PaidMediaChangeTimeline({ events, totalAvailable, onLoadMore, loadingMore }: Props) {
  const [level, setLevel] = useState<"all" | "campaign" | "ad_set" | "ad">("all");

  const filtered = useMemo(
    () => (level === "all" ? events : events.filter((e) => e.entityType === level)),
    [events, level]
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        {LEVEL_LABELS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => setLevel(l.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              level === l.value
                ? "border border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          Sin cambios registrados en el período.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((e) => (
            <li key={e.id} className="p-3 text-sm flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">{ENTITY_ICON[e.entityType] ?? "•"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium truncate">{e.entityName ?? e.entityMetaId}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(e.occurredAt)}</span>
                </div>
                <div className="text-sm text-muted-foreground">{describeEvent(e)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {events.length < totalAvailable && onLoadMore && (
        <div className="border-t border-border p-3 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-md px-3 py-1 text-xs font-medium text-primary hover:bg-accent disabled:opacity-50"
          >
            {loadingMore ? "Cargando…" : "Ver más"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add components/paid-media-change-timeline.tsx
git commit -m "feat(meta-v2): change-history timeline component"
```

---

## Task 12: Wire dashboard + extend campaign drawer

**Files:**
- Modify: `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx`
- Modify: `components/paid-media-campaign-drawer.tsx`

- [ ] **Step 1: Mount the ads table and change timeline on the dashboard page**

In `app/(protected)/app/accounts/[accountId]/paid-media/page.tsx`:

Add imports:

```ts
import { getActiveAdsWithKpis, getChangeEventsForAdAccount } from "@/lib/queries/paid-media";
import { PaidMediaAdsTable } from "@/components/paid-media-ads-table";
import { PaidMediaChangeTimeline } from "@/components/paid-media-change-timeline";
```

Extend the parallel fetch block (currently the `Promise.all` with `getKpisWithComparison` and `getCampaignsWithKpis`) to also fetch ads and change events:

```ts
const [{ current, deltas }, campaigns, ads, changeEvents] = await Promise.all([
  getKpisWithComparison(state.adAccount.id, since, until),
  getCampaignsWithKpis(state.adAccount.id, since, until),
  getActiveAdsWithKpis(state.adAccount.id, since, until),
  getChangeEventsForAdAccount(state.adAccount.id, since, until, 20, 0),
]);
```

After the existing `<PaidMediaCampaignsTable>` block, add the ads section and timeline section before the modal:

```tsx
<h2 className="font-semibold mb-3 mt-8">Anuncios activos</h2>
<PaidMediaAdsTable
  ads={ads}
  currency={currency}
  isEcommerce={state.adAccount.isEcommerce}
  adAccountId={state.adAccount.id}
  since={since}
  until={until}
/>

<h2 className="font-semibold mb-3 mt-8">Historial de cambios</h2>
<PaidMediaChangeTimeline events={changeEvents} totalAvailable={changeEvents.length} />
```

Note: pagination ("Ver más") is not wired in this task — `totalAvailable` is set to the current length so the button does not appear. Pagination can be added later if the list proves long enough to need it.

- [ ] **Step 2: Extend the campaign drawer with ads and changes sections**

Open `components/paid-media-campaign-drawer.tsx`. At the top, add the server-action import and hooks for lazy-loaded data. The pattern:

```tsx
// add imports
import { useEffect, useState, useTransition } from "react";
import { PaidMediaChangeTimeline } from "./paid-media-change-timeline";
import type { ChangeEventRow, AdRow } from "@/lib/queries/paid-media";
```

Create a thin server action at `app/actions/paid-media-drawer.ts`:

```ts
"use server";

import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { db } from "@/lib/drizzle/db";
import { metaCampaigns, metaAdAccounts } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  getChangeEventsForCampaign,
  getActiveAdsWithKpis,
  type AdRow,
  type ChangeEventRow,
} from "@/lib/queries/paid-media";

async function assertCampaignAccess(campaignId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({ adAccountId: metaCampaigns.adAccountId })
    .from(metaCampaigns)
    .innerJoin(metaAdAccounts, eq(metaAdAccounts.id, metaCampaigns.adAccountId))
    .where(and(eq(metaCampaigns.id, campaignId), eq(metaAdAccounts.workspaceId, workspaceId)))
    .limit(1);
  if (rows.length === 0) throw new Error("forbidden");
  return rows[0].adAccountId;
}

export async function getCampaignDrawerData(
  campaignId: string,
  since: string,
  until: string
): Promise<{ ads: AdRow[]; changes: ChangeEventRow[] }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("no workspace");
  const adAccountId = await assertCampaignAccess(campaignId, workspace.id);
  const [allAds, changes] = await Promise.all([
    getActiveAdsWithKpis(adAccountId, since, until),
    getChangeEventsForCampaign(campaignId, 20),
  ]);
  const ads = allAds.filter((a) => a.campaignId === campaignId);
  return { ads, changes };
}
```

Then inside `paid-media-campaign-drawer.tsx`, inside the component that receives the selected campaign, add state + effect to load this data on campaign change, and render the sections below the existing KPIs:

```tsx
const [drawerData, setDrawerData] = useState<{ ads: AdRow[]; changes: ChangeEventRow[] } | null>(null);
const [, startTransition] = useTransition();

useEffect(() => {
  if (!campaign) { setDrawerData(null); return; }
  setDrawerData(null);
  startTransition(async () => {
    const d = await getCampaignDrawerData(campaign.id, since, until);
    setDrawerData(d);
  });
}, [campaign, since, until]);
```

Then in the drawer JSX, after the existing KPI stats block, add:

```tsx
<div className="mt-6">
  <h3 className="text-sm font-medium mb-2">Anuncios de esta campaña</h3>
  {!drawerData ? (
    <div className="text-xs text-muted-foreground">Cargando…</div>
  ) : drawerData.ads.length === 0 ? (
    <div className="text-xs text-muted-foreground">
      Sin anuncios con gasto o resultados en el período.
    </div>
  ) : (
    <ul className="divide-y divide-border text-sm">
      {drawerData.ads.map((ad) => (
        <li key={ad.id} className="py-2 flex items-center justify-between gap-2">
          <span className="truncate">{ad.name}</span>
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {formatMoney(ad.spend, currency)} · {ad.conversions} {labels.conversions.toLowerCase()}
          </span>
        </li>
      ))}
    </ul>
  )}
</div>

<div className="mt-6">
  <h3 className="text-sm font-medium mb-2">Cambios recientes</h3>
  {!drawerData ? (
    <div className="text-xs text-muted-foreground">Cargando…</div>
  ) : (
    <PaidMediaChangeTimeline events={drawerData.changes} totalAvailable={drawerData.changes.length} />
  )}
</div>
```

**Note:** the drawer component signature needs `since`, `until`, `currency` and computed `labels` in scope. If they are not already passed in via props, add them to the Props interface and propagate from the campaigns table (`PaidMediaCampaignsTable`) which in turn should receive them from the page. If they already exist, reuse them.

Add the import:

```ts
import { getCampaignDrawerData } from "@/app/actions/paid-media-drawer";
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 4: Manual smoke test**

Full end-to-end check with dev server running:

1. Reload paid-media page. Verify:
   - KPI cards all clickable, modal works for every metric.
   - Campaigns table filtered correctly.
   - "Anuncios activos" table appears below campaigns, shows only ads with spend/conversions > 0.
   - Click an ad row → ad drawer opens with stats + spend trend chart.
   - "Historial de cambios" timeline appears below ads, shows recent events with correct icons + descriptions, filter chips work.
2. Click a campaign row → campaign drawer opens:
   - Top KPI stats show (existing).
   - "Anuncios de esta campaña" section lists the ads.
   - "Cambios recientes" section shows a timeline scoped to this campaign + its ad sets + its ads.
3. Confirm labels are "Inversión" and "Leads"/"Ventas" everywhere.

If any account has not yet synced ads or change events, trigger a manual backfill via the Trigger.dev dashboard by re-running `backfill-meta-ads` for that ad account ID to populate data.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/app/accounts/[accountId]/paid-media/page.tsx" components/paid-media-campaign-drawer.tsx app/actions/paid-media-drawer.ts
git commit -m "feat(meta-v2): wire ads + timeline to dashboard, extend campaign drawer"
```

---

## Self-Review Checklist

After the plan is written, verify:

- **Spec §2 scope decisions**: label mapping ✓ (Task 2), ads table filter ✓ (Task 8 query + Task 10 UI), KPI chart on all cards ✓ (Task 9), polymorphic change events + rawActivity ✓ (Task 1 schema, Task 4 sync)
- **Spec §3 schema**: meta_ads ✓ (Task 1.1), meta_ad_insights_daily ✓ (Task 1.2), meta_change_events incl. parentCampaignMetaId ✓ (Task 1.3)
- **Spec §4 pipeline**: sync-single-ad-account extended ✓ (Task 5), backfill extended ✓ (Task 6), event whitelist + normalization ✓ (Task 4 EVENT_MAP), ad-set parent resolution ✓ (Task 4)
- **Spec §5 UI**: chart modal ✓ (Task 9), ads table ✓ (Task 10), change timeline ✓ (Task 11), campaign drawer extension ✓ (Task 12), label utility applied ✓ (Task 2)
- **Spec §6 queries**: getKpiDailyWithPrevious ✓ (Task 8.2), getActiveAdsWithKpis ✓ (Task 8.1), getAdDailyWithPrevious ✓ (Task 8.4), getChangeEventsForAdAccount ✓ (Task 8.3), getChangeEventsForCampaign ✓ (Task 8.4), server action ✓ (Task 9.1 + Task 12.2)
- **Spec §7 filter unification**: ✓ (Task 7)
- **Spec §8 out-of-scope items**: creative preview, signal analysis, retention-beyond-90d, webhooks — all correctly excluded, no tasks target them.
