import Link from "next/link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <div
          className="mx-auto mt-3 flex h-12 max-w-5xl items-center justify-between rounded-full px-5 backdrop-blur-[18px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]"
        >
          <Link href="/" className="font-semibold text-sm tracking-tight">
            nao.fyi
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
              className="text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-full px-4 py-1.5"
            >
              Empezar gratis
            </Link>
          </nav>
        </div>
      </header>
      <div className="pt-20">{children}</div>
    </>
  );
}
