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
 * Idempotente. Mantiene a lo sumo UN engagement base (source="account_fee") por
 * cuenta que representa el fee mensual recurrente en USD (regla MEP).
 * - fee null/0 → si existe, lo marca status="ended"; no crea nada.
 * - fee > 0 → crea engagement+período base si no existe; si existe, sincroniza
 *   el fee del período base y la fecha de inicio, y reactiva (status="active").
 *
 * El engagement base nunca lo borra la task de estructuración (que solo borra
 * source="llm"), así que la facturación recurrente siempre está presente.
 */
export async function ensureBaseEngagement(
  accountId: string,
  workspaceId: string,
  opts: { fee: string | null; startDate: string | null }
): Promise<void> {
  const start = opts.startDate ?? firstOfCurrentMonthISO();
  const feeNum = opts.fee != null ? Number(opts.fee) : NaN;
  const hasFee = Number.isFinite(feeNum) && feeNum > 0;

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

  if (!hasFee) {
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
        neurona: BASE_NEURONA,
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
    .set({ status: "active", startDate: start, updatedAt: new Date() })
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
