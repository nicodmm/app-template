import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/30">
      <div className="mb-8">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          plani.fyi
        </Link>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
