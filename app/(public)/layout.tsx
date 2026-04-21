import Link from "next/link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="font-semibold text-sm tracking-tight">
            plani.fyi
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-md px-3 py-1.5"
            >
              Empezar gratis
            </Link>
          </nav>
        </div>
      </header>
      <div className="pt-14">{children}</div>
    </>
  );
}
