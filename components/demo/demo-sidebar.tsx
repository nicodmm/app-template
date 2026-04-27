"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", href: "/demo/dashboard", icon: BarChart2 },
  { label: "Portfolio", href: "/demo/portfolio", icon: LayoutGrid },
];

export function DemoSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 backdrop-blur-[18px] [background:var(--glass-bg)] [border-right:1px_solid_var(--glass-border)]">
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
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
              <item.icon
                size={16}
                className={active ? "text-primary" : undefined}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mx-3 mb-3 rounded-lg p-3 backdrop-blur-[14px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)]">
        <div className="text-xs text-muted-foreground mb-1">Workspace demo</div>
        <div className="text-xs font-medium">Bloom Marketing</div>
      </div>
    </aside>
  );
}
