import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PageProps {
  searchParams: Promise<{ error?: string; message?: string }>;
}

export default async function SignupPage({ searchParams }: PageProps) {
  const { error, message } = await searchParams;

  async function signup(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
    if (error) redirect("/auth/signup?error=" + encodeURIComponent(error.message));
    redirect("/auth/signup?message=" + encodeURIComponent("Revisá tu email para confirmar tu cuenta"));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Crear cuenta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ¿Ya tenés cuenta?{" "}
          <Link href="/auth/login" className="text-primary underline underline-offset-4">
            Iniciá sesión
          </Link>
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
          {decodeURIComponent(error)}
        </div>
      )}
      {message && (
        <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-sm">
          {decodeURIComponent(message)}
        </div>
      )}

      <form action={signup} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
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
