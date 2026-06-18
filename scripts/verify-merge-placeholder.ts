import { db } from "@/lib/drizzle/db";
import { sql } from "drizzle-orm";
import { mergePlaceholderUser } from "@/lib/workspace/merge-placeholder-user";

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;
  const check = (label: string, ok: boolean): void => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    ok ? passed++ : failed++;
  };

  try {
    await db.transaction(async (tx) => {
      // Tomar un workspace real para FKs válidas.
      const [ws] = (await tx.execute(
        sql`SELECT id FROM workspaces LIMIT 1`
      )) as unknown as Array<{ id: string }>;
      if (!ws) throw new Error("No hay workspaces en la base para la prueba");

      // Crear placeholder + usuario real de prueba.
      const [ph] = (await tx.execute(
        sql`INSERT INTO users (email, pending) VALUES ('ph-test@merge.local', true) RETURNING id`
      )) as unknown as Array<{ id: string }>;
      const [real] = (await tx.execute(
        sql`INSERT INTO users (email, pending) VALUES ('real-test@merge.local', false) RETURNING id`
      )) as unknown as Array<{ id: string }>;

      // Asignaciones del placeholder: membership + account owner + tarea.
      // (tasks.description es NOT NULL, por eso se incluye.)
      await tx.execute(
        sql`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${ws.id}, ${ph.id}, 'member')`
      );
      const [acct] = (await tx.execute(
        sql`INSERT INTO accounts (workspace_id, name, owner_id) VALUES (${ws.id}, 'merge-test-acct', ${ph.id}) RETURNING id`
      )) as unknown as Array<{ id: string }>;
      await tx.execute(
        sql`INSERT INTO tasks (workspace_id, account_id, description, assignee_id, status) VALUES (${ws.id}, ${acct.id}, 'merge-test-task', ${ph.id}, 'pending')`
      );

      // Merge.
      await mergePlaceholderUser(tx, ph.id, real.id);

      // Verificaciones.
      const owner = (await tx.execute(
        sql`SELECT owner_id FROM accounts WHERE id = ${acct.id}`
      )) as unknown as Array<{ owner_id: string }>;
      check("account.owner_id re-apuntado al real", owner[0]?.owner_id === real.id);

      const assignee = (await tx.execute(
        sql`SELECT assignee_id FROM tasks WHERE account_id = ${acct.id} AND description = 'merge-test-task'`
      )) as unknown as Array<{ assignee_id: string }>;
      check("task.assignee_id re-apuntado al real", assignee[0]?.assignee_id === real.id);

      const mem = (await tx.execute(
        sql`SELECT user_id FROM workspace_members WHERE workspace_id = ${ws.id} AND user_id = ${real.id}`
      )) as unknown as Array<{ user_id: string }>;
      check("workspace_members re-apuntado al real", mem.length === 1);

      const phGone = (await tx.execute(
        sql`SELECT id FROM users WHERE id = ${ph.id}`
      )) as unknown as Array<{ id: string }>;
      check("placeholder borrado", phGone.length === 0);

      // No persistir: abortar la transacción.
      throw new Error("__ROLLBACK__");
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__ROLLBACK__") {
      console.error("Error inesperado:", e);
      process.exitCode = 1;
    }
  }

  console.log(
    `\n${passed} passed, ${failed} failed (cambios revertidos, nada persistido)`
  );
  if (failed > 0) process.exitCode = 1;
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end?.();
}

void main();
