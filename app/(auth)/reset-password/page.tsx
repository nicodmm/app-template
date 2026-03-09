import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  async function resetPassword(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`,
    });
    if (error) redirect("/auth/reset-password?error=" + encodeURIComponent(error.message));
    redirect("/auth/reset-password?message=Check your email for the reset link");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Reset password</h1>
        <p className="text-sm text-muted-foreground">
          Remember it?{" "}
          <Link href="/auth/login" className="underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
      <form action={resetPassword} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="you@example.com" />
        </div>
        <Button type="submit" className="w-full">Send reset link</Button>
      </form>
    </div>
  );
}
