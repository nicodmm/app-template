import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PageProps {
  searchParams: Promise<{ error?: string; message?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, message } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect("/auth/login?error=" + encodeURIComponent(error.message));
    redirect("/app/portfolio");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Iniciar sesión</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ¿No tenés cuenta?{" "}
          <Link href="/auth/signup" className="text-primary underline underline-offset-4">
            Registrate gratis
          </Link>
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
          {decodeURIComponent(error)}
        </div>
      )}
      {message && (
        <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-sm text-success-foreground">
          {decodeURIComponent(message)}
        </div>
      )}

      <form action={login} className="flex flex-col gap-4">
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
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" className="w-full mt-1">
          Iniciar sesión
        </Button>
      </form>

      <Link
        href="/auth/reset-password"
        className="text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </div>
  );
}
