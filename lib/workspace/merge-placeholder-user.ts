import { sql } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";

/** Transacción de drizzle (mismo tipo que recibe el callback de `db.transaction`). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * TODAS las columnas FK→`users.id` del schema, EXCEPTO `workspace_members.user_id`
 * (se maneja aparte por su unique (workspace_id, user_id)). Si agregás una tabla
 * nueva con FK a users, sumá su (tabla, columna) acá: es el único lugar que el
 * merge necesita conocer. Nombres en snake_case tal como están en la base.
 *
 * Auditada contra el schema 2026-06-18 (grep de `references(() => users.id)`).
 */
const USER_FK_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ["accounts", "owner_id"],
  ["account_consultants", "user_id"],
  ["context_documents", "uploaded_by_user_id"],
  ["drive_connections", "connected_by_user_id"],
  ["finance_projection_assumptions", "updated_by_user_id"],
  ["fx_rates", "created_by_user_id"],
  ["member_compensation", "user_id"],
  ["meta_connections", "connected_by_user_id"],
  ["notifications", "user_id"],
  ["notifications", "actor_id"],
  ["selection_searches", "owner_id"],
  ["signals", "resolved_by"],
  ["tasks", "created_by"],
  ["tasks", "assignee_id"],
  ["task_attachments", "created_by"],
  ["task_comments", "author_id"],
  ["task_comment_mentions", "user_id"],
  ["task_projects", "created_by"],
  ["task_project_members", "user_id"],
  ["transcripts", "uploaded_by"],
  ["workspaces", "owner_id"],
  ["workspace_invites", "invited_by_user_id"],
  ["workspace_invites", "accepted_by_user_id"],
];

/**
 * Mueve todas las referencias de `placeholderId` a `realId` y borra el placeholder.
 * Corre dentro de la transacción `tx` provista por el llamador. No-op si ambos ids
 * son iguales.
 *
 * `workspace_members` primero: borramos las membresías del placeholder en los
 * workspaces donde el usuario real YA es miembro (evita violar el unique), y el
 * resto las re-apuntamos. Para las otras tablas con unique compuesto incluyendo
 * user_id (account_consultants, task_project_members, task_comment_mentions) el
 * UPDATE es seguro porque el usuario real recién registrado no tiene filas previas.
 */
export async function mergePlaceholderUser(
  tx: Tx,
  placeholderId: string,
  realId: string
): Promise<void> {
  if (placeholderId === realId) return;

  await tx.execute(sql`
    DELETE FROM workspace_members wm
    WHERE wm.user_id = ${placeholderId}
      AND EXISTS (
        SELECT 1 FROM workspace_members wm2
        WHERE wm2.workspace_id = wm.workspace_id AND wm2.user_id = ${realId}
      )
  `);
  await tx.execute(
    sql`UPDATE workspace_members SET user_id = ${realId} WHERE user_id = ${placeholderId}`
  );

  for (const [table, column] of USER_FK_COLUMNS) {
    await tx.execute(
      sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)} = ${realId} WHERE ${sql.identifier(column)} = ${placeholderId}`
    );
  }

  await tx.execute(sql`DELETE FROM users WHERE id = ${placeholderId}`);
}

/**
 * True si el placeholder está asignado a algo (cuenta como owner/consultor, tarea,
 * proyecto, o compensación). Son las únicas columnas que un admin puede asignar a
 * alguien que todavía no se registró; el resto requiere que el usuario haya actuado.
 */
export async function placeholderHasAssignments(userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 AS one WHERE
         EXISTS (SELECT 1 FROM accounts WHERE owner_id = ${userId})
      OR EXISTS (SELECT 1 FROM account_consultants WHERE user_id = ${userId})
      OR EXISTS (SELECT 1 FROM tasks WHERE assignee_id = ${userId})
      OR EXISTS (SELECT 1 FROM task_project_members WHERE user_id = ${userId})
      OR EXISTS (SELECT 1 FROM member_compensation WHERE user_id = ${userId})
    LIMIT 1
  `);
  // postgres-js devuelve un array de filas; hay match si trajo alguna.
  return Array.isArray(result)
    ? result.length > 0
    : (result as { length: number }).length > 0;
}
