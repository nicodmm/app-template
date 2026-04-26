import Link from "next/link";
import { ChevronLeft, Shield } from "lucide-react";
import { requireAdminAccess } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminAccess();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between px-4 backdrop-blur-[18px] [background:var(--glass-bg)] [border-bottom:1px_solid_var(--glass-border)]">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-primary" aria-hidden />
          <span className="font-semibold text-sm tracking-tight">
            nao.fyi · admin
          </span>
        </div>
        <Link
          href="/app/portfolio"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft size={13} aria-hidden />
          Volver al app
        </Link>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
