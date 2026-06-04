import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getTaskAccessibleAccountIds } from "@/lib/queries/task-access";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { inArray } from "drizzle-orm";
import { GlassCard } from "@/components/ui/glass-card";

export default async function TareasIndexPage() {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const { accountIds } = await getTaskAccessibleAccountIds(userId, workspace.id);
  const rows =
    accountIds.length > 0
      ? await db
          .select({ id: accounts.id, name: accounts.name })
          .from(accounts)
          .where(inArray(accounts.id, accountIds))
          .orderBy(accounts.name)
      : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tareas</h1>
        <p className="text-sm text-muted-foreground">
          Elegí una cuenta para abrir su tablero. (La vista global llega pronto.)
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tenés cuentas con tareas asignadas.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((a) => (
            <Link key={a.id} href={`/app/tareas/${a.id}`}>
              <GlassCard className="p-4 hover:bg-accent/40 transition-colors cursor-pointer">
                <span className="font-medium">{a.name}</span>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
