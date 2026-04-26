"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, User, BarChart2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  role: string;
  /** True when the user has global users.role === 'admin' (platform owner). */
  isPlatformAdmin: boolean;
  transcriptsCount: number;
  transcriptsLimit: number;
  plan: string;
}

const navItems = [
  { label: "Dashboard", href: "/app/dashboard", icon: BarChart2 },
  { label: "Portfolio", href: "/app/portfolio", icon: LayoutGrid },
  { label: "Perfil", href: "/app/profile", icon: User },
];

const adminItems = [
  { label: "Plataforma", href: "/admin/dashboard", icon: Shield },
];

export function Sidebar({
  role: _role,
  isPlatformAdmin,
  transcriptsCount,
  transcriptsLimit,
  plan,
}: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const usagePercent =
    transcriptsLimit > 0
      ? Math.min(100, Math.round((transcriptsCount / transcriptsLimit) * 100))
      : 0;

  return (
    <aside
      className="hidden md:flex flex-col w-56 shrink-0 backdrop-blur-[18px] [background:var(--glass-bg)] [border-right:1px_solid_var(--glass-border)]"
    >
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-foreground font-medium [box-shadow:inset_0_0_0_1px_var(--glass-border)]"
                  : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-white/5"
              )}
            >
              <item.icon size={16} className={active ? "text-primary" : undefined} />
              {item.label}
            </Link>
          );
        })}

        {isPlatformAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                Admin
              </span>
            </div>
            {adminItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-foreground font-medium [box-shadow:inset_0_0_0_1px_var(--glass-border)]"
                      : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-white/5"
                  )}
                >
                  <item.icon size={16} className={active ? "text-primary" : undefined} />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="mx-3 mb-3 rounded-lg p-3 backdrop-blur-[14px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)]">
        <div className="text-xs text-muted-foreground mb-2">
          {transcriptsLimit > 0 ? (
            <>
              <span className="font-mono tabular-nums text-foreground">
                {transcriptsCount}
              </span>
              <span className="font-mono tabular-nums">/{transcriptsLimit}</span>{" "}
              transcripciones este mes
            </>
          ) : (
            <>Transcripciones ilimitadas</>
          )}
        </div>
        {transcriptsLimit > 0 && (
          <div className="h-1.5 rounded-full bg-white/30 dark:bg-white/10 overflow-hidden mb-2">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                usagePercent >= 90 ? "bg-destructive" : "bg-primary"
              )}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        )}
        <div className="text-xs font-medium capitalize">{plan}</div>
      </div>
    </aside>
  );
}
