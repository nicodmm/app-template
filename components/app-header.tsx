"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  userEmail: string;
  userInitial: string;
}

export function AppHeader({ userEmail, userInitial }: AppHeaderProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4 shrink-0">
      <Link href="/app/portfolio" className="font-semibold text-sm tracking-tight">
        nao.fyi
      </Link>

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium"
        >
          {userInitial}
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 top-10 z-20 w-52 rounded-md border border-border bg-background shadow-md py-1">
              <div className="px-3 py-2 text-xs text-muted-foreground truncate">
                {userEmail}
              </div>
              <div className="border-t border-border my-1" />
              <Link
                href="/app/profile"
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                <User size={14} />
                Perfil
              </Link>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
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
