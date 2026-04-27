import Link from "next/link";
import { Sparkles } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-3 px-4 bg-amber-500/15 [border-bottom:1px_solid_rgba(245,158,11,0.3)] text-xs">
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 min-w-0">
        <Sparkles size={13} aria-hidden className="shrink-0" />
        <span className="font-medium truncate">
          MODO DEMO · Datos ficticios para mostrar la plataforma
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/"
          className="text-amber-900 dark:text-amber-200 hover:underline"
        >
          Volver al sitio
        </Link>
        <Link
          href="/auth/signup"
          className="rounded-md bg-amber-600 px-2.5 py-1 text-white text-[11px] font-medium hover:bg-amber-700 transition-colors"
        >
          Crear cuenta real
        </Link>
      </div>
    </div>
  );
}
