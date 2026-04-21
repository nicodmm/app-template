"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, User, BarChart2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  role: string;
  transcriptsCount: number;
  transcriptsLimit: number;
  plan: string;
}

const navItems = [
  {
    label: "Portfolio",
    href: "/app/portfolio",
    icon: LayoutGrid,
  },
  {
    label: "Perfil",
    href: "/app/profile",
    icon: User,
  },
];

const adminItems = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: BarChart2,
  },
  {
    label: "Usuarios",
    href: "/admin/users",
    icon: Users,
  },
];

export function Sidebar({
  role,
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
    <aside className="hidden md:flex flex-col w-56 border-r border-border bg-background shrink-0">
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              isActive(item.href)
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <item.icon size={16} />
            {item.label}
          </Link>
        ))}

        {(role === "admin" || role === "owner") && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Admin
              </span>
            </div>
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive(item.href)
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="text-xs text-muted-foreground mb-1.5">
          {transcriptsLimit > 0 ? (
            <>
              {transcriptsCount}/{transcriptsLimit} transcripciones este mes
            </>
          ) : (
            <>Transcripciones ilimitadas</>
          )}
        </div>
        {transcriptsLimit > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
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
