import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getInviteByToken } from "@/lib/queries/workspace-invites";
import { db } from "@/lib/drizzle/db";
import { workspaces } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";

interface PageProps {
  searchParams: Promise<{ error?: string; message?: string; invite?: string }>;
}

export default async function SignupPage({ searchParams }: PageProps) {
  const { error, message, invite: inviteToken } = await searchParams;

  // Resolve invite context for the UI (without leaking details)
  let inviteContext: { workspaceName: string; email: string } | null = null;
  if (inviteToken) {
    const invite = await getInviteByToken(inviteToken);
    if (invite && !invite.acceptedAt && invite.expiresAt > new Date()) {
      const [ws] = await db
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, invite.workspaceId))
        .limit(1);
      if (ws) {
        inviteContext = { workspaceName: ws.name, email: invite.email };
      }
    }
  }

  async function signup(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const token = formData.get("invite") as string | null;
    const supabase = await createClient();

    const next = token ? `/invites/${token}` : "/app/portfolio";
    const emailRedirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}${token ? `&invite=${encodeURIComponent(token)}` : ""}`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    if (error) {
      const params = new URLSearchParams({ error: error.message });
      if (token) params.set("invite", token);
      redirect("/auth/signup?" + params.toString());
    }
    const okParams = new URLSearchParams({
      message: "Revisá tu email para confirmar tu cuenta",
    });
    if (token) okParams.set("invite", token);
    redirect("/auth/signup?" + okParams.toString());
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Crear cuenta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ¿Ya tenés cuenta?{" "}
          <Link
            href={inviteToken ? `/auth/login?invite=${inviteToken}` : "/auth/login"}
            className="text-primary underline underline-offset-4"
          >
            Iniciá sesión
          </Link>
        </p>
      </div>

      {inviteContext && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
          <p className="font-medium">Fuiste invitado a {inviteContext.workspaceName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Registrate con el email al que te llegó la invitación para unirte al workspace.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
          {decodeURIComponent(error)}
        </div>
      )}
      {message && (
        <div className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          {decodeURIComponent(message)}
        </div>
      )}

      <form action={signup} className="flex flex-col gap-4">
        {inviteToken && <input type="hidden" name="invite" value={inviteToken} />}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={inviteContext?.email ?? ""}
            placeholder="vos@empresa.com"
            autoComplete="email"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" className="w-full mt-1">
          Crear cuenta gratuita
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Al registrarte aceptás los{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          Términos de servicio
        </Link>{" "}
        y la{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Política de privacidad
        </Link>
        .
      </p>
    </div>
  );
}
