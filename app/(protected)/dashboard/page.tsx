import { requireUserId } from "@/lib/auth";

export default async function DashboardPage() {
  await requireUserId();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Your app starts here.</p>
    </main>
  );
}
