import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PageProps {
  searchParams: Promise<{ error?: string; message?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { error, message } = await searchParams;

  async function resetPassword(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/update-password`,
    });
    if (error) redirect("/auth/reset-password?error=" + encodeURIComponent(error.message));
    redirect("/auth/reset-password?message=" + encodeURIComponent("Revisá tu email para el link de recuperación"));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ¿La recordaste?{" "}
          <Link href="/auth/login" className="text-primary underline underline-offset-4">
            Volver al login
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

      <form action={resetPassword} className="flex flex-col gap-4">
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
        <Button type="submit" className="w-full">
          Enviar link de recuperación
        </Button>
      </form>
    </div>
  );
}
