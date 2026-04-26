"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ProfileSignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium hover:bg-accent/50 transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] disabled:opacity-60"
    >
      <LogOut size={14} />
      {pending ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
