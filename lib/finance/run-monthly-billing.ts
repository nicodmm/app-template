import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  financeEngagements,
  financeEngagementPeriods,
  billingRecords,
} from "@/lib/drizzle/schema";
import { getFxRate } from "@/lib/queries/finance";
import {
  isActiveInMonth,
  convertToArs,
  type BillingRule,
} from "@/lib/finance/compute";

/**
 * Upsert idempotente de las filas de facturación NO adicionales para el mes,
 * a partir de los engagements activos del workspace. Preserva
 * status/billedAt/paidAt de las filas existentes. Reutilizado por el server
 * action `generateBillingForMonth`, la page de finanzas (auto-gen al cargar) y
 * el cron mensual.
 *
 * El fee es un total único: si una cuenta tiene engagements LLM (los términos
 * definen/reparten el fee), su engagement base (source="account_fee") se EXCLUYE
 * para no duplicar el fee. Al final se borran las filas no-adicionales obsoletas
 * (de engagements que ya no facturan), así no quedan conceptos duplicados.
 */
export async function runMonthlyBilling(
  workspaceId: string,
  year: number,
  month: number
): Promise<{ created: number; updated: number }> {
  const fx = await getFxRate(workspaceId, year, month);

  const allActive = await db
    .select()
    .from(financeEngagements)
    .where(
      and(
        eq(financeEngagements.workspaceId, workspaceId),
        eq(financeEngagements.status, "active")
      )
    );

  // Cuentas cuyo fee lo definen los términos (tienen engagement LLM activo):
  // para ellas se ignora el engagement base, que duplicaría el fee.
  const accountsWithLlm = new Set(
    allActive.filter((e) => e.source === "llm").map((e) => e.accountId)
  );
  const engagements = allActive.filter(
    (e) => !(e.source === "account_fee" && accountsWithLlm.has(e.accountId))
  );

  const billableIds = engagements.map((e) => e.id);

  // Limpieza: borrar filas no-adicionales del mes que ya no correspondan a un
  // engagement facturable (base suprimido, engagement finalizado, etc.).
  if (billableIds.length === 0) {
    await db
      .delete(billingRecords)
      .where(
        and(
          eq(billingRecords.workspaceId, workspaceId),
          eq(billingRecords.year, year),
          eq(billingRecords.month, month),
          eq(billingRecords.isAdditional, false)
        )
      );
    return { created: 0, updated: 0 };
  }

  await db
    .delete(billingRecords)
    .where(
      and(
        eq(billingRecords.workspaceId, workspaceId),
        eq(billingRecords.year, year),
        eq(billingRecords.month, month),
        eq(billingRecords.isAdditional, false),
        notInArray(billingRecords.engagementId, billableIds)
      )
    );

  const periods = await db
    .select()
    .from(financeEngagementPeriods)
    .where(inArray(financeEngagementPeriods.engagementId, billableIds));

  let created = 0;
  let updated = 0;

  for (const engagement of engagements) {
    const activePeriod = periods.find(
      (p) =>
        p.engagementId === engagement.id &&
        isActiveInMonth(p.fromDate, p.toDate, year, month)
    );
    if (!activePeriod) continue;

    const fee = Number(activePeriod.fee);
    const currency = activePeriod.currency;
    const amountArs = convertToArs(
      fee,
      currency,
      engagement.billingRule as BillingRule,
      fx?.mepRate ?? null,
      fx?.ipcCoefficient ?? null
    );

    const [existing] = await db
      .select({ id: billingRecords.id })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.accountId, engagement.accountId),
          eq(billingRecords.engagementId, engagement.id),
          eq(billingRecords.year, year),
          eq(billingRecords.month, month),
          eq(billingRecords.isAdditional, false)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(billingRecords)
        .set({
          amountOriginal: String(fee),
          currencyOriginal: currency,
          amountArs: amountArs == null ? null : String(amountArs),
          fxRateUsed: fx ? String(fx.mepRate) : null,
          ipcUsed: fx ? String(fx.ipcCoefficient) : null,
          concept: engagement.neurona,
          updatedAt: new Date(),
        })
        .where(eq(billingRecords.id, existing.id));
      updated += 1;
    } else {
      await db.insert(billingRecords).values({
        workspaceId,
        accountId: engagement.accountId,
        engagementId: engagement.id,
        year,
        month,
        concept: engagement.neurona,
        amountOriginal: String(fee),
        currencyOriginal: currency,
        amountArs: amountArs == null ? null : String(amountArs),
        fxRateUsed: fx ? String(fx.mepRate) : null,
        ipcUsed: fx ? String(fx.ipcCoefficient) : null,
        status: "pending",
        isAdditional: false,
      });
      created += 1;
    }
  }

  return { created, updated };
}
