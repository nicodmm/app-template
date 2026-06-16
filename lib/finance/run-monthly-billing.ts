import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  financeEngagements,
  financeEngagementPeriods,
  billingRecords,
} from "@/lib/drizzle/schema";
import { getFxRate, getFxRatesMap } from "@/lib/queries/finance";
import {
  isActiveInMonth,
  periodBillableArs,
  effectiveFeeCurrency,
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

  // Limpieza de huérfanos: cuando se borra un engagement (p.ej. al re-parsear
  // términos, que elimina los engagements source="llm"), sus billing_records
  // quedan con engagement_id = NULL por el ON DELETE SET NULL. El `notInArray`
  // de arriba NO los alcanza, porque en SQL `engagement_id NOT IN (...)` es NULL
  // (no TRUE) cuando engagement_id es NULL — así que nunca se borraban y se
  // acumulaban como conceptos duplicados. Los eliminamos acá, restringido a
  // status "pending" para no destruir filas ya facturadas/cobradas.
  await db
    .delete(billingRecords)
    .where(
      and(
        eq(billingRecords.workspaceId, workspaceId),
        eq(billingRecords.year, year),
        eq(billingRecords.month, month),
        eq(billingRecords.isAdditional, false),
        isNull(billingRecords.engagementId),
        eq(billingRecords.status, "pending")
      )
    );

  const periods = await db
    .select()
    .from(financeEngagementPeriods)
    .where(inArray(financeEngagementPeriods.engagementId, billableIds));

  // FX map from the earliest period anchor up to the target month, so mep_ipc
  // can compound IPC from each period's first month to this month.
  let earliest = { year, month };
  for (const p of periods) {
    const py = parseInt(p.fromDate.slice(0, 4), 10);
    const pm = parseInt(p.fromDate.slice(5, 7), 10);
    if (py * 12 + (pm - 1) < earliest.year * 12 + (earliest.month - 1)) {
      earliest = { year: py, month: pm };
    }
  }
  const fxByMonth = await getFxRatesMap(workspaceId, earliest, { year, month });

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
    const rule = engagement.billingRule as BillingRule;
    const currency = activePeriod.currency;
    // Moneda real del fee (mep/mep_ipc ⇒ USD aunque esté guardado como ARS), para
    // que la columna "Original" no muestre "ARS" cuando es un USD a convertir.
    const effCurrency = effectiveFeeCurrency(rule, currency);
    const amountArs = periodBillableArs({
      fee,
      currency,
      rule,
      fromDate: activePeriod.fromDate,
      targetYear: year,
      targetMonth: month,
      fxByMonth,
    });

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
          currencyOriginal: effCurrency,
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
