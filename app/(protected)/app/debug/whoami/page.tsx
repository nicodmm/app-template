import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/drizzle/db";
import { users, workspaceMembers, workspaces } from "@/lib/drizzle/schema";

export const dynamic = "force-dynamic";

/**
 * Diagnostic page — shows the raw auth/DB state for the current user.
 * Useful when role checks misbehave (e.g. /admin redirects to /unauthorized
 * even though the public.users row says role=admin).
 */
export default async function WhoAmIPage() {
  const userId = await requireUserId();

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const [publicUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const memberRows = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      workspaceName: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));

  const isPlatformAdmin = publicUser?.role === "admin";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">whoami (debug)</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Estado crudo de tu sesión + fila en <code>public.users</code>. No
        comparte esto con nadie.
      </p>

      <div className="space-y-4 text-sm">
        <Section title="Supabase Auth (auth.users)">
          <Row k="user.id" v={authUser?.id ?? "—"} />
          <Row k="user.email" v={authUser?.email ?? "—"} />
          <Row k="last_sign_in_at" v={authUser?.last_sign_in_at ?? "—"} />
        </Section>

        <Section title="requireUserId() → ">
          <Row k="userId (cookie-derived)" v={userId} />
          <Row
            k="¿Coincide con auth.user.id?"
            v={authUser?.id === userId ? "✓ sí" : "✗ NO — sospechoso"}
          />
        </Section>

        <Section title="public.users WHERE id = userId">
          {publicUser ? (
            <>
              <Row k="id" v={publicUser.id} />
              <Row k="email" v={publicUser.email} />
              <Row k="full_name" v={publicUser.fullName ?? "(null)"} />
              <Row
                k="role (string literal)"
                v={JSON.stringify(publicUser.role)}
              />
              <Row
                k="role.length"
                v={String(publicUser.role.length)}
                hint='Si es != 5 (longitud de "admin"), hay whitespace o caracteres raros'
              />
              <Row
                k="role === 'admin'"
                v={publicUser.role === "admin" ? "✓ sí" : "✗ no"}
              />
              <Row
                k="created_at"
                v={publicUser.createdAt.toISOString()}
              />
            </>
          ) : (
            <p className="text-destructive">
              ⚠️ NO existe fila en <code>public.users</code> con este id. Por
              eso role check falla — necesitás crear la fila.
            </p>
          )}
        </Section>

        <Section title="isPlatformAdmin (lo que evalúa requireAdminAccess)">
          <Row
            k="resultado"
            v={
              isPlatformAdmin
                ? "✓ admin — debería poder entrar a /admin/*"
                : "✗ NO admin — redirige a /unauthorized"
            }
          />
        </Section>

        <Section title="workspace_members rows">
          {memberRows.length === 0 ? (
            <p className="text-muted-foreground">Sin membresías de workspace.</p>
          ) : (
            memberRows.map((m, i) => (
              <Row
                key={i}
                k={`${m.workspaceName}`}
                v={`role = ${m.role}`}
              />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl p-4 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <div className="space-y-1.5 text-xs font-mono">{children}</div>
    </section>
  );
}

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-muted-foreground">{k}:</span>
        <span className="break-all">{v}</span>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
