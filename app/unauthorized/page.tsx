import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Acceso denegado</h1>
      <p className="text-muted-foreground">No tenés permiso para ver esta página.</p>
      <Link
        href="/app/portfolio"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Ir al portfolio
      </Link>
    </main>
  );
}
