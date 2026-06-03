# Módulo de Finanzas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/app/finanzas` screen that computes monthly billing per client (with USD→ARS MEP/MEP+IPC conversion, status, history, LTV) and consultant fees (fixed + variable per neurona), fed by natural-language project terms structured by an LLM and NDA fields extracted by an LLM, gated by a per-member "Finanzas admin" flag.

**Architecture:** New tables hang off `accounts` (= projects): per-neurona `finance_engagements` with month-phased `finance_engagement_periods` and consultant `finance_fee_shares`; plus `account_finance` (billing/legal + docs), `account_consultants`, `member_compensation`, `fx_rates`, `billing_records`. Two trigger.dev LLM tasks produce **editable drafts** (terms structuring, NDA extraction). Pure compute helpers derive billing and honorarios per month. Access gated by `workspace_members.financeAdmin`.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + Supabase Postgres, Supabase Storage (`finance-docs` bucket), @anthropic-ai/sdk (Haiku 4.5) + trigger.dev v4, shadcn/ui + Tailwind (`GlassCard`, `lucide-react`), `pdfjs-dist`/`mammoth` for client-side text extraction (reuse `lib/selection/extract-text-client.ts`).

---

## Testing note (read first)

This repo has **no unit-test framework** and `npm run lint` is broken repo-wide (ESLint v10 vs `next lint`). Do not add either. Verification per task:
- `npm run type-check` (must pass)
- `npm run build` at the end of each phase
- Manual verification where noted

Postgres-js returns `numeric`/aggregate columns as **strings** — always coerce with `Number(...)` before math (see existing `lib/queries/selection.ts`). Commit after each task; auto-push is ON.

Reuse patterns from the Selección module shipped this session: `lib/supabase/admin.ts` (`createAdminClient`, add a finance bucket const), `app/actions/selection.ts` (`requireAccountInWorkspace`, `rethrowIfRedirect`), `trigger/tasks/generate-selection-report.ts` (LLM task shape), `components/selection/*` (dialogs, viewers), `lib/selection/extract-text-client.ts`.

---

## File map

**Schema / data**
- Create `lib/drizzle/schema/account_finance.ts`, `finance_engagements.ts`, `finance_engagement_periods.ts`, `finance_fee_shares.ts`, `account_consultants.ts`, `member_compensation.ts`, `fx_rates.ts`, `billing_records.ts`
- Modify `lib/drizzle/schema/workspace_members.ts` (add `financeAdmin`)
- Modify `lib/drizzle/schema/index.ts` (export new schemas)
- Migration: `drizzle/migrations/<generated>/down.sql`

**Backend / logic**
- Modify `lib/auth.ts` (add `requireFinanceAdmin` / `isFinanceAdmin`)
- Modify `lib/supabase/admin.ts` (add `FINANCE_DOCS_BUCKET`)
- Create `lib/finance/compute.ts` (pure month math + conversion + billing/honorarios derivation)
- Create `lib/queries/finance.ts` (fetchers for billing, honorarios, account finance)
- Create `app/actions/finance.ts` (account_finance, account_consultants, docs, fx, compensation, billing status)
- Create `app/actions/finance-terms.ts` (raw text, structuring trigger, engagements/periods/shares CRUD)
- Create `lib/ai/finance-terms-prompt.ts`, `lib/ai/nda-extract-prompt.ts`
- Create `trigger/tasks/structure-finance-terms.ts`, `trigger/tasks/extract-nda-fields.ts`
- Modify `app/actions/workspace.ts` (add `setMemberFinanceAdmin`)

**UI**
- Create `app/(protected)/app/finanzas/page.tsx` + `components/finance/*` (a-facturar, honorarios, mis-honorarios, fx-editor, billing-list)
- Create `components/account-detail/finance-section.tsx` (terms editor + docs + billing/legal form + equipo)
- Modify `app/(protected)/app/accounts/[accountId]/page.tsx` (render finance section when financeAdmin)
- Modify `app/(protected)/app/settings/workspace/page.tsx` (financeAdmin toggle per member)
- Modify the main nav to add a "Finanzas" link (find the nav component).

---

## Phase 1 — Foundation (schema, permissions, account_finance, equipo, docs)

### Task 1: All finance schemas + financeAdmin column + registration

**Files:** create 8 schema files; modify `workspace_members.ts`, `index.ts`.

- [ ] **Step 1: `lib/drizzle/schema/account_finance.ts`**

```ts
import { pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";

export const accountFinance = pgTable(
  "account_finance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    // Facturación
    razonSocial: text("razon_social"),
    cuit: text("cuit"),
    billingEmail: text("billing_email"),
    ivaCondition: text("iva_condition"),
    leadOrigin: text("lead_origin"),
    clientEmail: text("client_email"),
    clientResponsible: text("client_responsible"),
    // Representante legal (NDA)
    legalRepName: text("legal_rep_name"),
    legalRepDni: text("legal_rep_dni"),
    legalRepEmail: text("legal_rep_email"),
    legalAddress: text("legal_address"),
    city: text("city"),
    country: text("country"),
    // NDA doc
    ndaStoragePath: text("nda_storage_path"),
    ndaUrl: text("nda_url"),
    ndaFileName: text("nda_file_name"),
    ndaExtractedText: text("nda_extracted_text"),
    ndaExtractionStatus: text("nda_extraction_status").notNull().default("none"),
    ndaExtractionError: text("nda_extraction_error"),
    ndaExtractedAt: timestamp("nda_extracted_at"),
    // Propuesta doc
    proposalStoragePath: text("proposal_storage_path"),
    proposalUrl: text("proposal_url"),
    proposalFileName: text("proposal_file_name"),
    // Términos NL
    termsRawText: text("terms_raw_text"),
    termsStatus: text("terms_status").notNull().default("none"),
    termsError: text("terms_error"),
    termsStructuredAt: timestamp("terms_structured_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("account_finance_account_unique").on(table.accountId),
    index("account_finance_workspace_idx").on(table.workspaceId),
  ]
);

export type AccountFinance = typeof accountFinance.$inferSelect;
export type NewAccountFinance = typeof accountFinance.$inferInsert;
```

- [ ] **Step 2: `lib/drizzle/schema/finance_engagements.ts`**

```ts
import { pgTable, text, timestamp, uuid, integer, date, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";

export const financeEngagements = pgTable(
  "finance_engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    neurona: text("neurona").notNull(),
    currency: text("currency").notNull().default("USD"), // USD | ARS
    billingRule: text("billing_rule").notNull().default("mep"), // same | mep | mep_ipc
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: text("status").notNull().default("active"), // active | paused | ended
    sortOrder: integer("sort_order").notNull().default(0),
    source: text("source").notNull().default("manual"), // llm | manual
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("finance_engagements_account_idx").on(table.accountId),
    index("finance_engagements_workspace_idx").on(table.workspaceId),
    index("finance_engagements_account_status_idx").on(table.accountId, table.status),
  ]
);

export type FinanceEngagement = typeof financeEngagements.$inferSelect;
export type NewFinanceEngagement = typeof financeEngagements.$inferInsert;
```

- [ ] **Step 3: `lib/drizzle/schema/finance_engagement_periods.ts`**

```ts
import { pgTable, text, timestamp, uuid, numeric, date, index } from "drizzle-orm/pg-core";
import { financeEngagements } from "./finance_engagements";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";

export const financeEngagementPeriods = pgTable(
  "finance_engagement_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id").notNull().references(() => financeEngagements.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date"),
    fee: numeric("fee", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("finance_engagement_periods_engagement_idx").on(table.engagementId),
    index("finance_engagement_periods_account_idx").on(table.accountId),
  ]
);

export type FinanceEngagementPeriod = typeof financeEngagementPeriods.$inferSelect;
export type NewFinanceEngagementPeriod = typeof financeEngagementPeriods.$inferInsert;
```

- [ ] **Step 4: `lib/drizzle/schema/finance_fee_shares.ts`**

```ts
import { pgTable, text, timestamp, uuid, numeric, date, index } from "drizzle-orm/pg-core";
import { financeEngagements } from "./finance_engagements";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { workspaceMembers } from "./workspace_members";

export const financeFeeShares = pgTable(
  "finance_fee_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id").notNull().references(() => financeEngagements.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => workspaceMembers.id, { onDelete: "set null" }),
    consultantNameRaw: text("consultant_name_raw"),
    shareType: text("share_type").notNull(), // percent | fixed
    shareValue: numeric("share_value", { precision: 14, scale: 2 }).notNull(),
    shareCurrency: text("share_currency"), // for fixed
    appliesFrom: date("applies_from"),
    appliesTo: date("applies_to"),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("finance_fee_shares_engagement_idx").on(table.engagementId),
    index("finance_fee_shares_member_idx").on(table.memberId),
    index("finance_fee_shares_account_idx").on(table.accountId),
  ]
);

export type FinanceFeeShare = typeof financeFeeShares.$inferSelect;
export type NewFinanceFeeShare = typeof financeFeeShares.$inferInsert;
```

- [ ] **Step 5: `lib/drizzle/schema/account_consultants.ts`**

```ts
import { pgTable, text, timestamp, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const accountConsultants = pgTable(
  "account_consultants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    neurona: text("neurona"),
    roleLabel: text("role_label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("account_consultants_unique").on(table.accountId, table.userId, table.neurona),
    index("account_consultants_account_idx").on(table.accountId),
  ]
);

export type AccountConsultant = typeof accountConsultants.$inferSelect;
export type NewAccountConsultant = typeof accountConsultants.$inferInsert;
```

> NOTE: the unique index includes `neurona` which is nullable; Postgres treats NULLs as distinct, so two rows with NULL neurona for the same (account,user) are allowed. Acceptable for v1.

- [ ] **Step 6: `lib/drizzle/schema/member_compensation.ts`**

```ts
import { pgTable, text, timestamp, uuid, numeric, date, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const memberCompensation = pgTable(
  "member_compensation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("ARS"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("member_compensation_workspace_user_idx").on(table.workspaceId, table.userId),
  ]
);

export type MemberCompensation = typeof memberCompensation.$inferSelect;
export type NewMemberCompensation = typeof memberCompensation.$inferInsert;
```

- [ ] **Step 7: `lib/drizzle/schema/fx_rates.ts`**

```ts
import { pgTable, timestamp, uuid, integer, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12
    mepRate: numeric("mep_rate", { precision: 14, scale: 4 }).notNull(),
    ipcCoefficient: numeric("ipc_coefficient", { precision: 10, scale: 4 }).default("1"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fx_rates_workspace_year_month_unique").on(table.workspaceId, table.year, table.month),
  ]
);

export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
```

- [ ] **Step 8: `lib/drizzle/schema/billing_records.ts`**

```ts
import { pgTable, text, timestamp, uuid, integer, numeric, boolean, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";
import { financeEngagements } from "./finance_engagements";

export const billingRecords = pgTable(
  "billing_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id").references(() => financeEngagements.id, { onDelete: "set null" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    concept: text("concept").notNull(),
    amountOriginal: numeric("amount_original", { precision: 14, scale: 2 }).notNull(),
    currencyOriginal: text("currency_original").notNull(),
    amountArs: numeric("amount_ars", { precision: 14, scale: 2 }),
    fxRateUsed: numeric("fx_rate_used", { precision: 14, scale: 4 }),
    ipcUsed: numeric("ipc_used", { precision: 10, scale: 4 }),
    status: text("status").notNull().default("pending"), // pending | billed | paid
    billedAt: timestamp("billed_at"),
    paidAt: timestamp("paid_at"),
    isAdditional: boolean("is_additional").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("billing_records_workspace_period_idx").on(table.workspaceId, table.year, table.month),
    index("billing_records_account_period_idx").on(table.accountId, table.year, table.month),
    index("billing_records_workspace_status_idx").on(table.workspaceId, table.status),
  ]
);

export type BillingRecord = typeof billingRecords.$inferSelect;
export type NewBillingRecord = typeof billingRecords.$inferInsert;
```

- [ ] **Step 9: add `financeAdmin` to `workspace_members.ts`** — add the column inside the `pgTable` columns object (after `role`):

```ts
    financeAdmin: boolean("finance_admin").notNull().default(false),
```
Add `boolean` to the imports from `drizzle-orm/pg-core` on that file.

- [ ] **Step 10: register in `lib/drizzle/schema/index.ts`** — append:

```ts
export * from "./account_finance";
export * from "./finance_engagements";
export * from "./finance_engagement_periods";
export * from "./finance_fee_shares";
export * from "./account_consultants";
export * from "./member_compensation";
export * from "./fx_rates";
export * from "./billing_records";
```

- [ ] **Step 11: Type-check** — `npm run type-check` → PASS
- [ ] **Step 12: Commit** — `git add lib/drizzle/schema && git commit -m "feat(finanzas): schemas, financeAdmin flag, registration"`

---

### Task 2: Migration

**Files:** generated up migration + `drizzle/migrations/<name>/down.sql`

- [ ] **Step 1:** `npm run db:generate` — note the folder name (e.g. `0033_xxx`).
- [ ] **Step 2:** Inspect the generated `.sql` — confirm it CREATEs the 8 tables + `ALTER TABLE workspace_members ADD COLUMN finance_admin`. If it drops/alters anything else, STOP and report BLOCKED.
- [ ] **Step 3:** Create `drizzle/migrations/<name>/down.sql`:

```sql
ALTER TABLE "workspace_members" DROP COLUMN IF EXISTS "finance_admin";
DROP TABLE IF EXISTS "billing_records";
DROP TABLE IF EXISTS "fx_rates";
DROP TABLE IF EXISTS "member_compensation";
DROP TABLE IF EXISTS "account_consultants";
DROP TABLE IF EXISTS "finance_fee_shares";
DROP TABLE IF EXISTS "finance_engagement_periods";
DROP TABLE IF EXISTS "finance_engagements";
DROP TABLE IF EXISTS "account_finance";
```

- [ ] **Step 4:** `npm run db:migrate` → success.
- [ ] **Step 5: Commit** — `git add drizzle && git commit -m "feat(finanzas): migration for finance tables"`

> **PROD:** after merge, run `npm run db:migrate:prod` (separate from dev) before the feature works in production. Flag this in the PR.

---

### Task 3: Permissions helper + finance bucket

**Files:** modify `lib/auth.ts`, `lib/supabase/admin.ts`.

- [ ] **Step 1: add finance bucket** to `lib/supabase/admin.ts` (after `SELECTION_CV_BUCKET`):

```ts
export const FINANCE_DOCS_BUCKET = "finance-docs";
```

- [ ] **Step 2: add `requireFinanceAdmin`** to `lib/auth.ts`. Read the file to match its imports (it has `createClient`, db, etc.). Add:

```ts
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getWorkspaceMember } from "@/lib/queries/workspace";
// (use existing imports if already present — do not duplicate)

/** Returns true if the current user is a finance admin in their workspace. */
export async function isFinanceAdmin(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return false;
  const member = await getWorkspaceMember(workspace.id, userId);
  return !!member && (member.financeAdmin === true || member.role === "owner" || member.role === "admin");
}
```

> Owners/admins implicitly get finance-admin. `getWorkspaceMember` returns the `workspace_members` row (includes `financeAdmin` after Task 1). Confirm its return type includes the new column (it selects the whole row).

- [ ] **Step 3: Type-check** → PASS
- [ ] **Step 4: Commit** — `git add lib/auth.ts lib/supabase/admin.ts && git commit -m "feat(finanzas): finance-admin permission helper + docs bucket"`
- [ ] **Step 5 (manual):** create a **private** Supabase Storage bucket `finance-docs`.

---

### Task 4: `setMemberFinanceAdmin` action + settings UI toggle

**Files:** modify `app/actions/workspace.ts`, `app/(protected)/app/settings/workspace/page.tsx` (+ its members client component).

- [ ] **Step 1: action** — in `app/actions/workspace.ts`, mirror `changeWorkspaceMemberRole` (read it). Add:

```ts
export async function setMemberFinanceAdmin(
  targetUserId: string,
  value: boolean
): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return { error: "Workspace no encontrado" };
  const actor = await getWorkspaceMember(workspace.id, userId);
  assertCanManage(actor?.role);
  await db
    .update(workspaceMembers)
    .set({ financeAdmin: value })
    .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, targetUserId)));
  revalidatePath("/app/settings/workspace");
  return {};
}
```

- [ ] **Step 2: UI** — in the workspace members management UI (find the client component rendering the members list in `settings/workspace`), add a "Finanzas admin" toggle (checkbox/switch) per member that calls `setMemberFinanceAdmin(userId, checked)` and `router.refresh()`. The members query must include `financeAdmin` — update the query/select feeding that component (find `getWorkspaceMembers` in `lib/queries/workspace.ts`; ensure it returns `financeAdmin`).
- [ ] **Step 3: Type-check** → PASS
- [ ] **Step 4: Commit** — `git add app/actions/workspace.ts lib/queries/workspace.ts "app/(protected)/app/settings/workspace" components && git commit -m "feat(finanzas): per-member finance-admin toggle"`

---

### Task 5: account_finance + account_consultants actions

**Files:** create `app/actions/finance.ts`.

- [ ] **Step 1:** Create `app/actions/finance.ts` with the guard + account_finance upsert + consultants CRUD + doc actions. Reuse `requireAccountInWorkspace` pattern from `app/actions/selection.ts` (copy it — or import it; simplest is to re-declare a local copy here to avoid coupling). Include `rethrowIfRedirect` like selection.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accounts, accountFinance, accountConsultants,
} from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMember } from "@/lib/queries/workspace";
import { createAdminClient, FINANCE_DOCS_BUCKET } from "@/lib/supabase/admin";

type R = { success: boolean; error?: string; id?: string };

function rethrowIfRedirect(e: unknown): void {
  if (typeof e === "object" && e !== null && "digest" in e &&
      typeof (e as { digest?: unknown }).digest === "string" &&
      ((e as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
       (e as { digest: string }).digest === "NEXT_NOT_FOUND")) throw e;
}

/** Require the caller be a finance admin AND the account be in their workspace. Returns workspaceId. */
async function requireFinanceAccount(accountId: string): Promise<string> {
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) throw new Error("No workspace");
  const member = await getWorkspaceMember(workspace.id, userId);
  const allowed = !!member && (member.financeAdmin === true || member.role === "owner" || member.role === "admin");
  if (!allowed) throw new Error("Sin permiso de finanzas");
  const [acct] = await db.select({ id: accounts.id }).from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id))).limit(1);
  if (!acct) throw new Error("Cuenta no encontrada");
  return workspace.id;
}

/** Get-or-create the account_finance row, returns its id. */
async function ensureAccountFinance(accountId: string, workspaceId: string): Promise<string> {
  const [existing] = await db.select({ id: accountFinance.id }).from(accountFinance)
    .where(eq(accountFinance.accountId, accountId)).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(accountFinance)
    .values({ accountId, workspaceId }).returning({ id: accountFinance.id });
  return row.id;
}

export async function saveAccountFinanceFields(input: {
  accountId: string;
  fields: Partial<{
    razonSocial: string | null; cuit: string | null; billingEmail: string | null;
    ivaCondition: string | null; leadOrigin: string | null; clientEmail: string | null;
    clientResponsible: string | null; legalRepName: string | null; legalRepDni: string | null;
    legalRepEmail: string | null; legalAddress: string | null; city: string | null; country: string | null;
  }>;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    await ensureAccountFinance(input.accountId, workspaceId);
    await db.update(accountFinance).set({ ...input.fields, updatedAt: new Date() })
      .where(eq(accountFinance.accountId, input.accountId));
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) { rethrowIfRedirect(e); return { success: false, error: e instanceof Error ? e.message : "Error" }; }
}

export async function addAccountConsultant(input: {
  accountId: string; userId: string; neurona: string | null; roleLabel: string | null;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    const [row] = await db.insert(accountConsultants)
      .values({ workspaceId, accountId: input.accountId, userId: input.userId, neurona: input.neurona, roleLabel: input.roleLabel })
      .returning({ id: accountConsultants.id });
    if (!row) return { success: false, error: "No se pudo agregar" };
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true, id: row.id };
  } catch (e) { rethrowIfRedirect(e); return { success: false, error: e instanceof Error ? e.message : "Error" }; }
}

export async function removeAccountConsultant(input: { accountId: string; id: string }): Promise<R> {
  try {
    await requireFinanceAccount(input.accountId);
    await db.delete(accountConsultants)
      .where(and(eq(accountConsultants.id, input.id), eq(accountConsultants.accountId, input.accountId)));
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true };
  } catch (e) { rethrowIfRedirect(e); return { success: false, error: e instanceof Error ? e.message : "Error" }; }
}
```

- [ ] **Step 2: doc actions** — append NDA/proposal upload + URL + signed-url actions, mirroring `uploadCandidateCv`/`setCandidateCvUrl`/`getCandidateCvUrl` from `app/actions/selection.ts` but for `accountFinance` columns. Functions: `uploadFinanceDoc({accountId, kind: "nda"|"proposal", fileName, mimeType, fileSize, extractedText, fileBase64})` (for nda also sets `ndaExtractedText`), `setFinanceDocUrl({accountId, kind, url})`, `getFinanceDocUrl({accountId, kind})`. Use `FINANCE_DOCS_BUCKET`, path `${accountId}/${kind}/${Date.now()}-${fileName}`. Guard with `requireFinanceAccount`. Call `ensureAccountFinance` first.

- [ ] **Step 3: Type-check** → PASS
- [ ] **Step 4: Commit** — `git add app/actions/finance.ts && git commit -m "feat(finanzas): account_finance + consultants + docs actions"`

---

### Task 6: Account-detail Finanzas section (gating) + equipo + facturación form

**Files:** create `components/account-detail/finance-section.tsx` (+ small subcomponents); modify `app/(protected)/app/accounts/[accountId]/page.tsx`.

- [ ] **Step 1:** Create a server component `FinanceSection({ accountId })` that loads `account_finance` (or null), `account_consultants` (join users for names), and workspace members (for the add-consultant picker). Render a `GlassCard` titled "Finanzas" with three blocks (client subcomponents):
  - **Equipo** — list consultants (name, neurona, roleLabel) with remove; "Agregar consultor" picker (workspace members + neurona select from `workspace.services` + optional roleLabel) → `addAccountConsultant`.
  - **Facturación/legales** — editable form bound to `account_finance` fields → `saveAccountFinanceFields`. (Terms editor + docs added in later tasks; leave clearly marked insertion points.)
- [ ] **Step 2:** In the account page, render `<FinanceSection accountId={accountId} />` **only when** the caller is finance admin. The page already computes `member`; add `const canFinance = member.financeAdmin === true || member.role === "owner" || member.role === "admin";` and gate. (Confirm the page loads `member`; portfolio/dashboard show the pattern.)
- [ ] **Step 3: Type-check** → PASS
- [ ] **Step 4: Manual** — as a finance-admin, open an account, add a consultant, save a CUIT/razón social.
- [ ] **Step 5: Commit** — `git add components/account-detail/finance-section.tsx "app/(protected)/app/accounts/[accountId]/page.tsx" && git commit -m "feat(finanzas): account-detail finance section (equipo + facturación)"`

### Phase 1 gate
- [ ] `npm run build` → PASS.

---

## Phase 2 — Terms structuring (LLM) + editable tables

### Task 7: Terms prompt + `structure-finance-terms` task

**Files:** create `lib/ai/finance-terms-prompt.ts`, `trigger/tasks/structure-finance-terms.ts`.

- [ ] **Step 1: prompt** — `lib/ai/finance-terms-prompt.ts`:

```ts
export interface TermsContext {
  accountName: string;
  neuronasContratadas: string[]; // from serviceScope
  kickoffDate: string | null;    // ISO, account.startDate
  baseFee: string | null;        // account.fee
  consultants: Array<{ name: string; neurona: string | null }>;
  rawText: string;
}

export const FINANCE_TERMS_SYSTEM = `Sos un asistente de administración financiera para una agencia de consultoría con varias "neuronas" (servicios). Tu tarea es convertir la descripción en lenguaje natural de las condiciones comerciales de un proyecto en una estructura JSON.

Reglas:
- Un proyecto puede tener varias neuronas en simultáneo y los fees pueden variar mes a mes.
- Para cada neurona producí un "engagement" con: moneda (USD o ARS), regla de facturación (same | mep | mep_ipc), y una lista de períodos {fromMonth (1 = primer mes), toMonth (null = en adelante), fee, currency}.
- El reparto a consultores ("shares"): type "percent" (porcentaje del fee, 0-100) o "fixed" (monto en una moneda). Referenciá al consultor por nombre tal cual aparezca.
- "Gastos adicionales" → additionalCharges: {concept, amount, currency, month (null = único/este mes), recurring}.
- Si un dato no está, omitilo o usá null. No inventes montos.
- Respondé SOLO con el JSON, sin texto extra.`;

export function buildTermsUserMessage(ctx: TermsContext): string {
  const parts: string[] = [];
  parts.push(`Proyecto/cliente: ${ctx.accountName}`);
  if (ctx.neuronasContratadas.length) parts.push(`Neuronas contratadas: ${ctx.neuronasContratadas.join(", ")}`);
  if (ctx.kickoffDate) parts.push(`Kick off: ${ctx.kickoffDate}`);
  if (ctx.baseFee) parts.push(`Fee base de referencia: ${ctx.baseFee}`);
  if (ctx.consultants.length) parts.push(`Consultores del proyecto: ${ctx.consultants.map(c => c.neurona ? `${c.name} (${c.neurona})` : c.name).join(", ")}`);
  parts.push(`Condiciones (lenguaje natural):\n${ctx.rawText}`);
  parts.push("Devolvé el JSON con la forma: { engagements: [{ neurona, currency, billingRule, periods: [{fromMonth,toMonth,fee,currency}], shares: [{consultantName, type, value, currency}] }], additionalCharges: [{concept, amount, currency, month, recurring}], notes }");
  return parts.join("\n\n");
}
```

- [ ] **Step 2: task** — `trigger/tasks/structure-finance-terms.ts`. Mirror `generate-selection-report.ts`. Input `{ accountId, workspaceId }`. Steps: load `account_finance.termsRawText` + account (name, serviceScope, startDate, fee) + `account_consultants` (join users). Call Anthropic (Haiku 4.5) with the prompt. Parse JSON (use `JSON.parse` on the text, guarded; on parse failure set termsStatus="error"). Then in a transaction:
  - Delete existing engagements for the account WHERE `source = 'llm'` (cascade removes their periods/shares).
  - For each engagement: insert `finance_engagements` (source 'llm'), compute `startDate` = account.startDate (or null), insert periods converting fromMonth/toMonth to dates: `fromDate = addMonths(startDate, fromMonth-1)`, `toDate = toMonth ? endOf(addMonths(startDate, toMonth-1)) : null` (if startDate null, leave dates null and store the month offsets in nothing — fallback: use first-of-current-month; document this). Insert shares (source 'llm', map consultantName → memberId by matching `account_consultants`/members name, else null).
  - additionalCharges: store as `billing_records` with `isAdditional=true` for the given month (or skip if no month) — OR keep them in notes for v1. **For v1, store additionalCharges into `account_finance.termsError`? No.** Store them as pending `billing_records` only when month is set and startDate known; otherwise append to `termsRawText` note. To keep this task bounded: **v1 ignores additionalCharges in structuring** and the admin adds them manually in the billing view (Phase 4). Note this in the prompt result handling with a `logger.info`.
  - Set `termsStatus='ready'`, `termsStructuredAt=now`. On error set `termsStatus='error'`, `termsError`.
  - `logLlmUsage({ workspaceId, accountId, taskName: "structure-finance-terms", model, usage })`.
  Use a small local `addMonths(dateISO, n)` helper.

- [ ] **Step 3: Type-check** → PASS
- [ ] **Step 4: Deploy note** — trigger worker redeploys on master push via the (now fixed) workflow.
- [ ] **Step 5: Commit** — `git add lib/ai/finance-terms-prompt.ts trigger/tasks/structure-finance-terms.ts && git commit -m "feat(finanzas): LLM terms structuring task"`

---

### Task 8: Terms server actions (raw text, trigger, engagements/periods/shares CRUD)

**Files:** create `app/actions/finance-terms.ts`.

- [ ] **Step 1:** Create the file with `requireFinanceAccount` (import or re-declare as in Task 5) and:
  - `saveTermsRawText({accountId, rawText})` → ensureAccountFinance + update termsRawText.
  - `structureTerms({accountId})` → set termsStatus="structuring", enqueue `structure-finance-terms` via `import("@trigger.dev/sdk/v3")`; on enqueue failure set "error". (Mirror `generateCandidateReport`.)
  - Engagement CRUD: `createEngagement`, `updateEngagement`, `deleteEngagement` (set source 'manual' on manual create/edit).
  - Period CRUD: `createPeriod`, `updatePeriod`, `deletePeriod`.
  - Share CRUD: `createShare`, `updateShare`, `deleteShare`, plus `mapShareMember({shareId, accountId, memberId})`.
  All guarded by `requireFinanceAccount(accountId)` and scoped by accountId in WHERE. Each returns `{success,error?,id?}` and `revalidatePath('/app/accounts/'+accountId)`. Show full code for at least `createEngagement`, `createPeriod`, `createShare`, `mapShareMember` (the rest follow the exact same shape — write them all, no "similar to" placeholders).

```ts
// createEngagement example (write the analogous update/delete + period/share ones in full):
export async function createEngagement(input: {
  accountId: string; neurona: string; currency: string; billingRule: string;
  startDate: string | null; endDate: string | null;
}): Promise<R> {
  try {
    const workspaceId = await requireFinanceAccount(input.accountId);
    const [row] = await db.insert(financeEngagements).values({
      workspaceId, accountId: input.accountId, neurona: input.neurona,
      currency: input.currency, billingRule: input.billingRule,
      startDate: input.startDate, endDate: input.endDate, source: "manual",
    }).returning({ id: financeEngagements.id });
    if (!row) return { success: false, error: "No se pudo crear" };
    revalidatePath(`/app/accounts/${input.accountId}`);
    return { success: true, id: row.id };
  } catch (e) { rethrowIfRedirect(e); return { success: false, error: e instanceof Error ? e.message : "Error" }; }
}
```

- [ ] **Step 2: Type-check** → PASS
- [ ] **Step 3: Commit** — `git add app/actions/finance-terms.ts && git commit -m "feat(finanzas): terms raw-text, structuring trigger, engagements/periods/shares CRUD"`

---

### Task 9: Terms editor UI (account-detail)

**Files:** create `components/finance/terms-editor.tsx` (+ row dialogs); modify `components/account-detail/finance-section.tsx` to mount it.

- [ ] **Step 1:** Build a client component fed by the account's engagements (+ periods + shares) and workspace members. UI:
  - A textarea bound to `termsRawText` + "Guardar" (`saveTermsRawText`) + "Estructurar con IA" (`structureTerms`) with status badge + **auto-refresh while `termsStatus==="structuring"`** (poll `router.refresh()` every 4s, cap 30 — copy the effect from `components/selection/report-editor.tsx`).
  - An editable table: per engagement (neurona, moneda, regla, fechas) → its periods (desde/hasta/fee/moneda) → its shares (consultor [member select] / tipo / valor / moneda). CRUD via the Task 8 actions, using small dialogs mirroring `components/selection/search-form-dialog.tsx`. Show `consultantNameRaw` next to unmapped shares with a member picker (`mapShareMember`).
- [ ] **Step 2:** The `FinanceSection` server component must also load engagements/periods/shares (add a query to `lib/queries/finance.ts`: `getAccountTerms(accountId)` returning nested structure) and pass to the editor.
- [ ] **Step 3: Type-check + build** → PASS
- [ ] **Step 4: Manual** — write NL terms, structure with AI, verify rows appear and are editable; map a consultant.
- [ ] **Step 5: Commit** — `git add components/finance lib/queries/finance.ts components/account-detail/finance-section.tsx && git commit -m "feat(finanzas): terms editor UI with AI structuring"`

---

## Phase 3 — NDA extraction

### Task 10: NDA prompt + task + actions + UI

**Files:** create `lib/ai/nda-extract-prompt.ts`, `trigger/tasks/extract-nda-fields.ts`; extend `app/actions/finance.ts`; extend `components/account-detail/finance-section.tsx`.

- [ ] **Step 1: prompt** — `lib/ai/nda-extract-prompt.ts` with `NDA_EXTRACT_SYSTEM` (extract Argentine billing/legal fields, respond JSON only) and `buildNdaUserMessage(text)`. Output JSON keys: `razonSocial, cuit, billingEmail, ivaCondition, legalRepName, legalRepDni, legalRepEmail, legalAddress, city, country, clientResponsible`.
- [ ] **Step 2: task** — `trigger/tasks/extract-nda-fields.ts` (mirror selection report): input `{accountId, workspaceId}`, read `account_finance.ndaExtractedText`, call Anthropic, parse JSON, update only the non-null extracted fields on `account_finance` (do NOT overwrite a field the admin already filled with a non-empty value — only fill empties), set `ndaExtractionStatus='ready'`, `ndaExtractedAt`. On error set 'error'. `logLlmUsage(taskName:"extract-nda-fields")`.
- [ ] **Step 3: action** — add `extractNda({accountId})` to `app/actions/finance.ts`: set `ndaExtractionStatus='extracting'`, enqueue task (mirror `generateCandidateReport`).
- [ ] **Step 4: UI** — in `FinanceSection`, add an NDA/Propuesta block: upload (reuse `extractTextFromFile` for NDA to set `ndaExtractedText` via `uploadFinanceDoc`) or paste Drive URL (`setFinanceDocUrl`), a "Extraer datos del NDA" button (`extractNda`) with status + auto-refresh while extracting, and a viewer link for each doc (`getFinanceDocUrl`).
- [ ] **Step 5: Type-check + build** → PASS
- [ ] **Step 6: Commit** — `git add lib/ai/nda-extract-prompt.ts trigger/tasks/extract-nda-fields.ts app/actions/finance.ts components/account-detail/finance-section.tsx && git commit -m "feat(finanzas): NDA upload + LLM field extraction"`

---

## Phase 4 — FX/IPC + billing

### Task 11: Compute helpers (pure)

**Files:** create `lib/finance/compute.ts`.

- [ ] **Step 1:** Pure, dependency-free functions (so they're trivially reviewable). Use string-or-number inputs and return numbers.

```ts
export type BillingRule = "same" | "mep" | "mep_ipc";

/** A YYYY-MM-DD date string, or null. */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-based; day 0 => last day of prev → here gives last day of `month`
  const end = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** True if [fromDate,toDate] overlaps the calendar month. Null fromDate => not active. Null toDate => open-ended. */
export function isActiveInMonth(fromDate: string | null, toDate: string | null, year: number, month: number): boolean {
  if (!fromDate) return false;
  const { start, end } = monthBounds(year, month);
  if (fromDate > end) return false;
  if (toDate && toDate < start) return false;
  return true;
}

/** Convert an amount to ARS per the billing rule. Returns null if conversion needed but no MEP rate. */
export function convertToArs(
  amount: number, currency: string, rule: BillingRule,
  mepRate: number | null, ipcCoefficient: number | null
): number | null {
  if (currency === "ARS") return round2(amount);
  // currency === "USD"
  if (rule === "same") return null; // billed in USD, no ARS figure
  if (mepRate == null) return null;
  const base = amount * mepRate;
  if (rule === "mep_ipc") return round2(base * (ipcCoefficient ?? 1));
  return round2(base);
}

export function round2(n: number): number { return Math.round(n * 100) / 100; }

/** Variable fee for a share given the active period fee (both already in the same conceptual currency handling). */
export function shareAmount(
  shareType: "percent" | "fixed", shareValue: number,
  periodFee: number
): number {
  if (shareType === "percent") return round2((shareValue / 100) * periodFee);
  return round2(shareValue);
}
```

- [ ] **Step 2: Type-check** → PASS
- [ ] **Step 3: Commit** — `git add lib/finance/compute.ts && git commit -m "feat(finanzas): pure billing/honorarios compute helpers"`

---

### Task 12: fx_rates actions + UI

**Files:** extend `app/actions/finance.ts`; create `components/finance/fx-editor.tsx`.

- [ ] **Step 1: actions** — `upsertFxRate({year, month, mepRate, ipcCoefficient})` and `listFxRates()` (or query in `lib/queries/finance.ts`). Guard: caller must be finance admin (workspace-level, not per account — add a `requireFinanceWorkspace()` helper: like `requireFinanceAccount` but without the account check, returning workspaceId). Upsert by `(workspaceId, year, month)` using `onConflictDoUpdate`.
- [ ] **Step 2: UI** — `fx-editor.tsx`: table of months with MEP + IPC inputs, add/edit. Used inside the finanzas page (Task 13).
- [ ] **Step 3: Type-check** → PASS
- [ ] **Step 4: Commit** — `git add app/actions/finance.ts components/finance/fx-editor.tsx lib/queries/finance.ts && git commit -m "feat(finanzas): fx_rates (MEP/IPC) actions + editor"`

---

### Task 13: Billing generation + queries + A-facturar UI

**Files:** extend `app/actions/finance.ts`, `lib/queries/finance.ts`; create `app/(protected)/app/finanzas/page.tsx` + `components/finance/billing-list.tsx` + `components/finance/finanzas-tabs.tsx`.

- [ ] **Step 1: generation action** — `generateBillingForMonth({year, month})`: finance-admin (workspace). For each active engagement (status active, `isActiveInMonth` of its current period) of every account in the workspace: find the active period (the period whose [fromDate,toDate] contains the month — query periods, pick with `isActiveInMonth`), read fx_rate for the month, compute `amountArs` via `convertToArs`, **upsert** a `billing_records` row keyed by `(accountId, engagementId, year, month)` — insert if missing, and if present DO NOT overwrite `status/billedAt/paidAt` (only refresh amounts). Use a select-then-insert/update (no partial unique needed): for each engagement, check existing record; insert or update amounts only. Additional charges are created via a separate `addBillingCharge` action (manual).
- [ ] **Step 2: queries** — in `lib/queries/finance.ts`: `getBillingForMonth(workspaceId, year, month)` (join accounts for name), `getBillingHistory(workspaceId)` (monthly sums of amountArs), `getLtvByAccount(workspaceId)` (historical billed + projected future periods until endDate, default 12-month horizon when open-ended — implement the projection in JS over engagements/periods). Coerce numerics with `Number()`.
- [ ] **Step 3: status + charge actions** — `setBillingStatus({id, status})` (sets billedAt/paidAt accordingly), `addBillingCharge({accountId, year, month, concept, amount, currency})` (isAdditional=true), `deleteBillingCharge({id})`.
- [ ] **Step 4: page + UI** — `app/(protected)/app/finanzas/page.tsx` (server): require auth; compute `isFinanceAdmin`. If finance admin → render `<FinanzasTabs>` with tabs **A facturar / Honorarios / TC-IPC** (Honorarios filled in Phase 5). If not → render `<MisHonorarios>` (Phase 5 — for now a placeholder that says "Próximamente" is NOT allowed; instead, build Phase 5 before shipping the page, OR render only the A-facturar tab for admins and leave member view for Task 15). **To avoid a placeholder: Task 13 ships the page gated to finance admins only (members get a "Sin acceso" message); Task 15 adds the member view.** `billing-list.tsx`: month selector, table (cliente, concepto, monto original→ARS, estado dropdown via `setBillingStatus`), "Generar mes" button (`generateBillingForMonth`), totals, "TC pendiente" warnings when `amountArs` is null. Add a history chart + LTV list (can reuse the dashboard's chart components if present; otherwise a simple table).
- [ ] **Step 5: nav** — add a "Finanzas" link to the app nav (find the nav component used by the protected layout; mirror the dashboard/portfolio link).
- [ ] **Step 6: Type-check + build** → PASS
- [ ] **Step 7: Manual** — enter a MEP rate, generate the month, see amounts in ARS, change a status.
- [ ] **Step 8: Commit** — `git add app/actions/finance.ts lib/queries/finance.ts "app/(protected)/app/finanzas" components/finance && git commit -m "feat(finanzas): billing generation + A-facturar view + history/LTV"`

---

## Phase 5 — Honorarios

### Task 14: member_compensation actions + UI

**Files:** extend `app/actions/finance.ts`, `lib/queries/finance.ts`; create `components/finance/compensation-editor.tsx`.

- [ ] **Step 1: actions** — `setMemberCompensation({userId, amount, currency, effectiveFrom, effectiveTo})` (finance-admin workspace), `listMemberCompensation()`. Store history rows; "current" = row with effectiveFrom <= today and (effectiveTo null or >= today).
- [ ] **Step 2: UI** — `compensation-editor.tsx`: per workspace member, set fixed amount + currency + effectiveFrom. Mounted in the Honorarios tab (admin).
- [ ] **Step 3: Type-check** → PASS
- [ ] **Step 4: Commit** — `git add app/actions/finance.ts lib/queries/finance.ts components/finance/compensation-editor.tsx && git commit -m "feat(finanzas): member fixed compensation"`

---

### Task 15: Honorarios computation + admin view + Mis honorarios

**Files:** extend `lib/queries/finance.ts`; create `components/finance/honorarios-admin.tsx`, `components/finance/mis-honorarios.tsx`; modify `app/(protected)/app/finanzas/page.tsx` and `finanzas-tabs.tsx`.

- [ ] **Step 1: query** — `computeHonorarios(workspaceId, year, month, opts?: { userId?: string })`: for each member (or just `userId`):
  - fixed = current `member_compensation` active in month (amount + currency).
  - variable = for each engagement active in month with a `fee_share` for that member (respect appliesFrom/To via `isActiveInMonth`): find active period fee; `shareAmount(type, value, periodFee)`; track currency (engagement currency for percent, shareCurrency for fixed). Optionally convert to ARS via fx + billingRule using `convertToArs`.
  - Return per-member: `{ userId, name, fixed: {amount,currency}, variable: Array<{accountName, neurona, amount, currency}>, totalByCurrency }`.
  Use the pure helpers from `lib/finance/compute.ts`. Coerce numerics.
- [ ] **Step 2: admin view** — `honorarios-admin.tsx`: month selector, table per consultant (fijo + total variable + total), expandable breakdown by project/neurona. Mount as the "Honorarios" tab.
- [ ] **Step 3: member view** — `mis-honorarios.tsx`: the current user's `computeHonorarios(..., {userId})`, with month selector and per-project breakdown.
- [ ] **Step 4: page wiring** — in `finanzas/page.tsx`: finance admin → tabs include Honorarios (admin) + compensation editor; non-admin member → render `<MisHonorarios userId={currentUserId} />` instead of "Sin acceso".
- [ ] **Step 5: Type-check + build** → PASS
- [ ] **Step 6: Manual** — set a fixed comp + a percent share; verify a consultant's monthly total = fixed + variable; verify member view shows only their own.
- [ ] **Step 7: Commit** — `git add lib/queries/finance.ts components/finance "app/(protected)/app/finanzas" && git commit -m "feat(finanzas): honorarios computation + admin & member views"`

---

## Phase 6 — Verification

### Task 16: Full verification + E2E

- [ ] `npm run type-check` → PASS
- [ ] `npm run build` → PASS
- [ ] **E2E manual:**
  1. Settings → mark a member as Finanzas admin; confirm a non-admin only sees "Mis honorarios".
  2. Account → Finanzas: add consultants, write NL terms, "Estructurar con IA", verify engagements/periods/shares appear and are editable; map a consultant.
  3. Upload an NDA, "Extraer datos", verify billing/legal fields fill; confirm/edit.
  4. Finanzas → TC/IPC: load a MEP rate (+IPC) for the month.
  5. Finanzas → A facturar: "Generar mes", verify USD→ARS conversion (MEP and MEP+IPC), mark Facturado/Cobrado, see history + LTV.
  6. Finanzas → Honorarios: set a fixed comp; verify a consultant's total = fixed + variable; check the member's own "Mis honorarios".
- [ ] **Deploy:** confirm trigger workers deploy (the `structure-finance-terms` + `extract-nda-fields` tasks) via the GH workflow; run `npm run db:migrate:prod`; create the `finance-docs` bucket in prod Supabase.

---

## Self-review notes (coverage vs spec)
- §2 data model → Tasks 1–2. §2.9 permissions → Tasks 1, 3, 4.
- §3.1 terms LLM → Tasks 7–9. §3.2 NDA LLM → Task 10.
- §4.2 billing → Tasks 11–13. §4.3 honorarios → Tasks 14–15.
- §5 permissions/UI → Tasks 4, 6, 9, 13, 15. §5.4 portfolio/equipo → Task 6.
- §6 idempotencia: `source` columns (Task 1), structuring replaces only `source='llm'` (Task 7), billing upsert preserves status (Task 13).
- §7 phases map 1:1 to Phases 1–5.
- Out of scope (§8): no AFIP, no Drive fetch, manual FX, account=project, single fixed comp — none introduced.

## Known decisions baked in
- `additionalCharges` from the LLM are **not** auto-created in v1 (Task 7) — admin adds charges manually in A-facturar (Task 13). Logged, not silently dropped.
- If an engagement has no `startDate`, relative-month periods can't be dated; the structuring task falls back to first-of-current-month and the admin adjusts. Surface this in the terms editor.
- LTV open-ended horizon = 12 months, labeled "estimado".
