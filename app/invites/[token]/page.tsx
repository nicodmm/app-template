import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInviteByToken } from "@/lib/queries/workspace-invites";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { db } from "@/lib/drizzle/db";
import { workspaces } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { acceptWorkspaceInvite } from "@/app/actions/workspace";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params;

  const invite = await getInviteByToken(token);
  if (!invite) {
    return (
      <MessageCard
        title="Invitación no encontrada"
        body="Este link de invitación no es válido o fue revocado."
      />
    );
  }
  if (invite.acceptedAt) {
    return (
      <MessageCard
        title="Invitación ya usada"
        body="Esta invitación ya fue aceptada."
      />
    );
  }
  if (invite.expiresAt < new Date()) {
    return (
      <MessageCard
        title="Invitación expirada"
        body="Pedile al workspace que te genere una nueva."
      />
    );
  }

  const [inviteWorkspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, invite.workspaceId))
    .limit(1);
  const workspaceName = inviteWorkspace?.name ?? "el workspace";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/signup?invite=${token}`);
  }

  // User is authed. Try accepting.
  const existing = await getWorkspaceByUserId(user.id);
  if (existing && existing.id !== invite.workspaceId) {
    return (
      <MessageCard
        title="Ya pertenecés a otro workspace"
        body={`Para unirte a "${workspaceName}", cerrá sesión y registrate con otro email usando este mismo link.`}
        actionHref="/app/portfolio"
        actionLabel="Volver al portfolio"
      />
    );
  }

  if (existing && existing.id === invite.workspaceId) {
    redirect("/app/portfolio");
  }

  const result = await acceptWorkspaceInvite(token);
  if (result.error) {
    return <MessageCard title="No se pudo aceptar la invitación" body={result.error} />;
  }

  redirect("/app/portfolio");
}

function MessageCard({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
