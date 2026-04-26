import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/drizzle/db";
import { users, workspaceMembers } from "@/lib/drizzle/schema";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { ProfileNameForm } from "@/components/profile-name-form";
import { ProfilePasswordForm } from "@/components/profile-password-form";
import { ProfileSignOutButton } from "@/components/profile-signout-button";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Administrador",
  member: "Miembro",
};

function formatMonth(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(d);
}

export default async function ProfilePage() {
  const userId = await requireUserId();
  const userRow = (
    await db.select().from(users).where(eq(users.id, userId)).limit(1)
  )[0];
  if (!userRow) redirect("/auth/login");

  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const memberRow = (
    await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .limit(1)
  )[0];
  if (!memberRow) redirect("/auth/login");

  const displayName = userRow.fullName?.trim() || null;
  const initial = (displayName ?? userRow.email).charAt(0).toUpperCase();
  const roleLabel = ROLE_LABEL[memberRow.role] ?? "Miembro";
  const isElevated =
    memberRow.role === "owner" || memberRow.role === "admin";

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Perfil</h1>

      <div className="flex flex-col gap-4">
        {/* Header card */}
        <section className="rounded-xl p-5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-semibold shadow-md shadow-primary/30 ring-2 ring-white/30">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={
                  displayName
                    ? "text-lg font-semibold truncate"
                    : "text-lg italic text-muted-foreground"
                }
              >
                {displayName ?? "Sin nombre"}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground truncate">
                  {userRow.email}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-primary/10 text-primary">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Datos personales */}
        <section className="rounded-xl p-5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <h2 className="text-sm font-semibold mb-1">Datos personales</h2>
          <p className="text-xs text-muted-foreground mb-4">
            El nombre se muestra en cuentas, dashboard y miembros del workspace.
          </p>
          <ProfileNameForm initialName={userRow.fullName} />
          <div className="mt-5 pt-4 [border-top:1px_solid_var(--glass-border)]">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Email
            </p>
            <p className="text-sm">{userRow.email}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Para cambiar tu email escribinos a{" "}
              <a
                href="mailto:hola@nao.fyi"
                className="underline underline-offset-2 hover:text-primary"
              >
                hola@nao.fyi
              </a>
              .
            </p>
          </div>
        </section>

        {/* Cambiar contraseña */}
        <section className="rounded-xl p-5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <h2 className="text-sm font-semibold mb-1">Cambiar contraseña</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Mínimo 8 caracteres. Te vamos a pedir tu contraseña actual para
            confirmar.
          </p>
          <ProfilePasswordForm />
        </section>

        {/* Mi workspace */}
        <section className="rounded-xl p-5 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          <h2 className="text-sm font-semibold mb-3">Mi workspace</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Workspace
              </dt>
              <dd className="text-sm">{workspace.name}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tu rol
              </dt>
              <dd className="text-sm">{roleLabel}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Miembro desde
              </dt>
              <dd className="text-sm">{formatMonth(memberRow.createdAt)}</dd>
            </div>
          </dl>
          {isElevated && (
            <Link
              href="/app/settings/workspace"
              className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Ir a configuración del workspace
              <ChevronRight size={14} />
            </Link>
          )}
        </section>

        {/* Sign out */}
        <div className="flex justify-end mt-2">
          <ProfileSignOutButton />
        </div>
      </div>
    </div>
  );
}
