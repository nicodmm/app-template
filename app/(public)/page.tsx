import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">App Name</h1>
      <p className="text-muted-foreground">Replace with your tagline</p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/auth/login">Log in</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/auth/signup">Sign up</Link>
        </Button>
      </div>
    </main>
  );
}
