import { task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  accountFinance,
  accounts,
  accountConsultants,
  financeEngagements,
  financeEngagementPeriods,
  financeFeeShares,
  workspaceMembers,
  users,
} from "@/lib/drizzle/schema";
import { logLlmUsage } from "@/lib/ai/log-usage";
import {
  buildTermsUserMessage,
  FINANCE_TERMS_SYSTEM,
  type TermsContext,
} from "@/lib/ai/finance-terms-prompt";

const MODEL = "claude-haiku-4-5-20251001";
const anthropic = new Anthropic();

interface StructureFinanceTermsInput {
  accountId: string;
  workspaceId: string;
}

interface ParsedPeriod {
  fromMonth: number;
  toMonth: number | null;
  fee: number;
  currency: string;
}

interface ParsedShare {
  consultantName: string;
  type: string;
  value: number;
  currency: string | null;
}

interface ParsedEngagement {
  neurona: string;
  currency: string;
  billingRule: string;
  periods: ParsedPeriod[];
  shares: ParsedShare[];
}

interface ParsedTerms {
  engagements: ParsedEngagement[];
  additionalCharges?: unknown[];
  notes?: string | null;
}

/**
 * Returns the first day of the month `n` months after `baseISO`.
 * Uses UTC math and clamps the day to 1 to avoid month-overflow surprises
 * (e.g. adding a month to Jan 31). Period boundaries only need month
 * granularity, so first-of-month is acceptable per spec.
 */
function addMonths(baseISO: string, n: number): string {
  const [y, m] = baseISO.split("-").map((p) => parseInt(p, 10));
  // m is 1-based; convert to 0-based index for Date.UTC.
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the last day of the month `n` months after `baseISO` (YYYY-MM-DD).
 * Computed as day 0 of the following month in UTC.
 */
function lastDayOfMonthISO(baseISO: string, n: number): string {
  const [y, m] = baseISO.split("-").map((p) => parseInt(p, 10));
  // Day 0 of (month + n + 1) === last day of (month + n).
  const d = new Date(Date.UTC(y, m - 1 + n + 1, 0));
  return d.toISOString().slice(0, 10);
}

function firstOfCurrentMonthISO(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
}

function normalizeName(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

function stripFences(text: string): string {
  let t = text.trim();
  // Remove a leading ```json / ``` fence and trailing ``` if present.
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return t.trim();
}

export const structureFinanceTerms = task({
  id: "structure-finance-terms",
  retry: { maxAttempts: 3, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  run: async (
    payload: StructureFinanceTermsInput
  ): Promise<{ status: string }> => {
    // 1. Load account_finance row.
    const [financeRow] = await db
      .select()
      .from(accountFinance)
      .where(eq(accountFinance.accountId, payload.accountId))
      .limit(1);

    const rawText = financeRow?.termsRawText?.trim() ?? "";
    if (!financeRow || !rawText) {
      logger.info("No finance row or empty terms text — skipping", {
        accountId: payload.accountId,
      });
      return { status: "skipped" };
    }

    // 2. Load account.
    const [account] = await db
      .select({
        name: accounts.name,
        serviceScope: accounts.serviceScope,
        startDate: accounts.startDate,
        fee: accounts.fee,
        ownerId: accounts.ownerId,
      })
      .from(accounts)
      .where(eq(accounts.id, payload.accountId))
      .limit(1);

    if (!account) {
      logger.info("Account not found — skipping", {
        accountId: payload.accountId,
      });
      return { status: "skipped" };
    }

    // 3. Load account consultants joined with users.
    const consultantRows = await db
      .select({
        userId: accountConsultants.userId,
        fullName: users.fullName,
        email: users.email,
        neurona: accountConsultants.neurona,
      })
      .from(accountConsultants)
      .innerJoin(users, eq(users.id, accountConsultants.userId))
      .where(eq(accountConsultants.accountId, payload.accountId));

    const consultants = consultantRows.map((c) => ({
      name: c.fullName ?? c.email,
      neurona: c.neurona,
    }));

    // The project lead (owner) always counts as a consultant for term
    // resolution, even if not explicitly in account_consultants.
    if (account.ownerId && !consultantRows.some((c) => c.userId === account.ownerId)) {
      const [owner] = await db
        .select({ fullName: users.fullName, email: users.email })
        .from(users)
        .where(eq(users.id, account.ownerId))
        .limit(1);
      if (owner) {
        consultants.unshift({ name: owner.fullName ?? owner.email, neurona: null });
      }
    }

    const neuronasContratadas = account.serviceScope
      ? account.serviceScope
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const ctx: TermsContext = {
      accountName: account.name,
      neuronasContratadas,
      kickoffDate: account.startDate ?? null,
      baseFee: account.fee ?? null,
      consultants,
      rawText,
    };

    try {
      // 4. Call Anthropic.
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: FINANCE_TERMS_SYSTEM,
        messages: [{ role: "user", content: buildTermsUserMessage(ctx) }],
      });

      await logLlmUsage({
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        taskName: "structure-finance-terms",
        model: MODEL,
        usage: resp.usage,
      });

      const text = resp.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("\n");

      // 5. Parse JSON (strip markdown fences first).
      let parsed: ParsedTerms;
      try {
        parsed = JSON.parse(stripFences(text)) as ParsedTerms;
      } catch (parseErr) {
        logger.error("Failed to parse LLM JSON", {
          accountId: payload.accountId,
          message:
            parseErr instanceof Error ? parseErr.message : "parse error",
        });
        await db
          .update(accountFinance)
          .set({
            termsStatus: "error",
            termsError: "No se pudo interpretar la respuesta",
            updatedAt: new Date(),
          })
          .where(eq(accountFinance.accountId, payload.accountId));
        return { status: "error" };
      }

      const engagements = Array.isArray(parsed.engagements)
        ? parsed.engagements
        : [];

      // 6a. Delete existing LLM-sourced engagements (periods/shares cascade).
      await db
        .delete(financeEngagements)
        .where(
          and(
            eq(financeEngagements.accountId, payload.accountId),
            eq(financeEngagements.source, "llm")
          )
        );

      // 6a-bis. Load the auto base-fee engagement (source="account_fee") so we
      // can suppress it when the LLM produces the full fee structure (the fee
      // is a single total; LLM engagements split/define it, so the base must
      // not also bill — that was the double-counting bug).
      const [baseEngagement] = await db
        .select({ id: financeEngagements.id })
        .from(financeEngagements)
        .where(
          and(
            eq(financeEngagements.accountId, payload.accountId),
            eq(financeEngagements.source, "account_fee")
          )
        )
        .limit(1);

      // 6b. Determine engagement start.
      const engStart = account.startDate ?? firstOfCurrentMonthISO();

      // Build the member lookup for name matching. We collect candidate
      // strings (workspace member full names + emails) mapped to their
      // workspace_members.id. The account consultants' names/emails come
      // from the same users, so matching against workspace members covers
      // both the account consultants and any other member referenced by name.
      const members = await db
        .select({
          memberId: workspaceMembers.id,
          fullName: users.fullName,
          email: users.email,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, payload.workspaceId));

      // A name is only used if it maps to exactly one distinct member id.
      const nameToMemberIds = new Map<string, Set<string>>();
      const addCandidate = (name: string | null, memberId: string): void => {
        if (!name) return;
        const key = normalizeName(name);
        if (!key) return;
        let set = nameToMemberIds.get(key);
        if (!set) {
          set = new Set<string>();
          nameToMemberIds.set(key, set);
        }
        set.add(memberId);
      };

      for (const m of members) {
        addCandidate(m.fullName, m.memberId);
        addCandidate(m.email, m.memberId);
      }

      const resolveMemberId = (consultantName: string): string | null => {
        const key = normalizeName(consultantName);
        const set = nameToMemberIds.get(key);
        if (set && set.size === 1) {
          return Array.from(set)[0];
        }
        return null;
      };

      // 6c. Insert engagements + periods + shares.
      let insertedCount = 0;
      for (const eng of engagements) {
        const neurona = (eng.neurona ?? "").trim();
        if (!neurona) continue;

        const billingRule =
          eng.billingRule === "same" || eng.billingRule === "mep_ipc"
            ? eng.billingRule
            : "mep";
        // Invariante: mep/mep_ipc convierten un fee USD a ARS, así que la moneda
        // SIEMPRE es USD bajo esas reglas. Solo "same" puede ser ARS. Esto evita
        // el contrasentido (rule mep_ipc + moneda ARS) que el LLM a veces produce.
        const usdByRule = billingRule === "mep" || billingRule === "mep_ipc";
        const currency = usdByRule
          ? "USD"
          : eng.currency === "ARS"
            ? "ARS"
            : "USD";

        const [insertedEng] = await db
          .insert(financeEngagements)
          .values({
            workspaceId: payload.workspaceId,
            accountId: payload.accountId,
            neurona,
            currency,
            billingRule,
            startDate: engStart,
            endDate: null,
            source: "llm",
          })
          .returning({ id: financeEngagements.id });

        const engagementId = insertedEng.id;
        insertedCount += 1;

        const periods = Array.isArray(eng.periods) ? eng.periods : [];
        for (const period of periods) {
          const fromMonth =
            typeof period.fromMonth === "number" && period.fromMonth >= 1
              ? period.fromMonth
              : 1;
          const fromDate = addMonths(engStart, fromMonth - 1);
          const toDate =
            period.toMonth != null
              ? lastDayOfMonthISO(engStart, period.toMonth - 1)
              : null;
          // Misma invariante que el engagement: mep/mep_ipc ⇒ USD.
          const periodCurrency = usdByRule
            ? "USD"
            : period.currency === "ARS"
              ? "ARS"
              : "USD";

          await db.insert(financeEngagementPeriods).values({
            engagementId,
            accountId: payload.accountId,
            workspaceId: payload.workspaceId,
            fromDate,
            toDate,
            fee: String(period.fee ?? 0),
            currency: periodCurrency,
            source: "llm",
          });
        }

        const shares = Array.isArray(eng.shares) ? eng.shares : [];
        for (const share of shares) {
          const consultantName = (share.consultantName ?? "").trim();
          const memberId = consultantName
            ? resolveMemberId(consultantName)
            : null;
          const shareType = share.type === "fixed" ? "fixed" : "percent";

          await db.insert(financeFeeShares).values({
            engagementId,
            accountId: payload.accountId,
            workspaceId: payload.workspaceId,
            memberId,
            consultantNameRaw: consultantName || null,
            shareType,
            shareValue: String(share.value ?? 0),
            shareCurrency: share.currency ?? null,
            source: "llm",
          });
        }
      }

      // 6c-bis. Suppress or revive the auto base-fee engagement. When the LLM
      // produced the full fee structure, the base must NOT also bill (it would
      // double-count the fee). When the LLM produced nothing, keep the base
      // active so account.fee still bills.
      if (baseEngagement) {
        await db
          .update(financeEngagements)
          .set({
            status: insertedCount > 0 ? "ended" : "active",
            updatedAt: new Date(),
          })
          .where(eq(financeEngagements.id, baseEngagement.id));
      }

      // 6d. additionalCharges — not materialized in v1.
      const additionalCount = Array.isArray(parsed.additionalCharges)
        ? parsed.additionalCharges.length
        : 0;
      logger.info("additionalCharges ignored in v1 structuring", {
        count: additionalCount,
      });

      // 6e. Mark ready.
      await db
        .update(accountFinance)
        .set({
          termsStatus: "ready",
          termsError: null,
          termsStructuredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(accountFinance.accountId, payload.accountId));

      logger.info("Finance terms structured", {
        accountId: payload.accountId,
        engagements: engagements.length,
      });

      return { status: "ready" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      logger.error("Finance terms structuring failed", {
        accountId: payload.accountId,
        message,
      });
      await db
        .update(accountFinance)
        .set({
          termsStatus: "error",
          termsError: message.substring(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(accountFinance.accountId, payload.accountId));
      throw err;
    }
  },
});
