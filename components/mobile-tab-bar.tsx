"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, User, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Dashboard", href: "/app/dashboard", Icon: BarChart2 },
  { label: "Portfolio", href: "/app/portfolio", Icon: LayoutGrid },
  { label: "Perfil", href: "/app/profile", Icon: User },
];

/**
 * Bottom tab bar for mobile (hidden on md and up where the sidebar takes
 * over). Mirrors the primary nav items from `<Sidebar>` so the user has a
 * consistent set of destinations regardless of viewport.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 flex md:hidden backdrop-blur-[18px] [background:var(--glass-bg)] [border-top:1px_solid_var(--glass-border)] [box-shadow:0_-8px_24px_-12px_rgba(15,18,53,0.18)]"
    >
      {tabs.map(({ label, href, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="relative">
              <Icon size={20} aria-hidden />
              {active && (
                <span
                  aria-hidden
                  className="absolute -top-2 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary"
                />
              )}
            </span>
            <span className="text-[10px] font-medium leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
