import { db } from "@/lib/drizzle/db";
import { financeEngagements, financeEngagementPeriods } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";

const BASE_SOURCE = "account_fee";
const BASE_NEURONA = "Fee mensual";

function firstOfCurrentMonthISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Concepto del fee base: si hay exactamente un servicio contratado, usarlo (así
 * el bill dice "Growth 1500" en vez de "Fee mensual 1500"). Si hay varios o
 * ninguno, etiqueta genérica.
 */
function baseConcept(serviceScope: string | null | undefined): string {
  const services = (serviceScope ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return services.length === 1 ? services[0] : BASE_NEURONA;
}

/** True si la cuenta tiene engagements LLM activos (los términos definen el fee). */
async function hasActiveLlmEngagements(accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: financeEngagements.id })
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.accountId, accountId),
        eq(financeEngagements.source, "llm"),
        eq(financeEngagements.status, "active")
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Idempotente. Mantiene a lo sumo UN engagement base (source="account_fee") por
 * cuenta, que representa el fee mensual recurrente en USD (regla MEP) como UN
 * único total.
 *
 * El fee es un total único: cuando los términos están estructurados (existen
 * engagements LLM activos que definen/reparten el fee), el base se SUPRIME
 * (status="ended") para no duplicar el fee. Cuando no hay términos, el base =
 * account.fee y es la única línea.
 *
 * - hay engagements LLM activos → base "ended" (los términos mandan).
 * - fee null/0 → base "ended"; no crea nada.
 * - fee > 0 y sin términos → crea/sincroniza el base con account.fee.
 */
export async function ensureBaseEngagement(
  accountId: string,
  workspaceId: string,
  opts: { fee: string | null; startDate: string | null; serviceScope?: string | null }
): Promise<void> {
  const start = opts.startDate ?? firstOfCurrentMonthISO();
  const feeNum = opts.fee != null ? Number(opts.fee) : NaN;
  const hasFee = Number.isFinite(feeNum) && feeNum > 0;
  const concept = baseConcept(opts.serviceScope);

  const [existing] = await db
    .select()
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.accountId, accountId),
        eq(financeEngagements.source, BASE_SOURCE)
      )
    )
    .limit(1);

  // Los términos estructurados definen el fee → suprimir el base.
  const llmActive = await hasActiveLlmEngagements(accountId);

  if (!hasFee || llmActive) {
    if (existing && existing.status !== "ended") {
      await db
        .update(financeEngagements)
        .set({ status: "ended", updatedAt: new Date() })
        .where(eq(financeEngagements.id, existing.id));
    }
    return;
  }

  if (!existing) {
    const [eng] = await db
      .insert(financeEngagements)
      .values({
        workspaceId,
        accountId,
        neurona: concept,
        currency: "USD",
        billingRule: "mep",
        startDate: start,
        endDate: null,
        status: "active",
        source: BASE_SOURCE,
      })
      .returning({ id: financeEngagements.id });
    await db.insert(financeEngagementPeriods).values({
      engagementId: eng.id,
      accountId,
      workspaceId,
      fromDate: start,
      toDate: null,
      fee: String(feeNum),
      currency: "USD",
      source: BASE_SOURCE,
    });
    return;
  }

  await db
    .update(financeEngagements)
    .set({ status: "active", neurona: concept, startDate: start, updatedAt: new Date() })
    .where(eq(financeEngagements.id, existing.id));

  // Sincronizar el período base abierto. Si no hay, crear uno.
  const [basePeriod] = await db
    .select()
    .from(financeEngagementPeriods)
    .where(
      and(
        eq(financeEngagementPeriods.engagementId, existing.id),
        eq(financeEngagementPeriods.source, BASE_SOURCE)
      )
    )
    .limit(1);

  if (basePeriod) {
    await db
      .update(financeEngagementPeriods)
      .set({ fee: String(feeNum), fromDate: start, updatedAt: new Date() })
      .where(eq(financeEngagementPeriods.id, basePeriod.id));
  } else {
    await db.insert(financeEngagementPeriods).values({
      engagementId: existing.id,
      accountId,
      workspaceId,
      fromDate: start,
      toDate: null,
      fee: String(feeNum),
      currency: "USD",
      source: BASE_SOURCE,
    });
  }
}

export { BASE_SOURCE as BASE_ENGAGEMENT_SOURCE, BASE_NEURONA };
