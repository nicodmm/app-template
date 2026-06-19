import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accounts, accountConsultants } from "@/lib/drizzle/schema";

/**
 * Conjunto de `accountId` dentro de `workspaceId` donde `userId` es el
 * responsable de la cuenta (`accounts.ownerId`) o un consultor
 * (`account_consultants`).
 *
 * Es la única fuente de verdad del gate de auto-import de Drive: un Drive
 * personal solo puede alimentar las cuentas que esa persona realmente posee o
 * en las que trabaja, para que las reuniones de alguien (p.ej. finanzas) no se
 * derramen en cuentas ajenas que se nombren al pasar.
 */
export async function getAccountIdsForUser(
  workspaceId: string,
  userId: string
): Promise<Set<string>> {
  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.ownerId, userId)));

  const consulting = await db
    .select({ id: accountConsultants.accountId })
    .from(accountConsultants)
    .where(
      and(
        eq(accountConsultants.workspaceId, workspaceId),
        eq(accountConsultants.userId, userId)
      )
    );

  const set = new Set<string>();
  for (const r of owned) set.add(r.id);
  for (const r of consulting) set.add(r.id);
  return set;
}
