"use client";

import Link from "next/link";
import { LogOut, User, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppHeader({
  userEmail,
  userInitial,
}: {
  userEmail: string;
  userInitial: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between px-4 backdrop-blur-[18px] [background:var(--glass-bg)] [border-bottom:1px_solid_var(--glass-border)]"
    >
      <Link href="/app/portfolio" className="font-semibold text-sm tracking-tight">
        nao.fyi
      </Link>

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú de usuario"
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-md shadow-primary/30 ring-2 ring-white/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {userInitial}
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <div
              role="menu"
              className="absolute right-0 top-10 z-20 w-56 rounded-xl py-1 backdrop-blur-[18px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]"
            >
              <div className="px-3 py-2 text-xs text-muted-foreground truncate">
                {userEmail}
              </div>
              <div className="my-1 h-px [background:var(--glass-border)]" />
              <Link
                href="/app/profile"
                role="menuitem"
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/40 dark:hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                <User size={14} />
                Perfil
              </Link>
              <Link
                href="/app/settings/workspace"
                role="menuitem"
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/40 dark:hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                <Users size={14} />
                Workspace
              </Link>
              <button
                onClick={handleSignOut}
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/40 dark:hover:bg-white/5"
              >
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
