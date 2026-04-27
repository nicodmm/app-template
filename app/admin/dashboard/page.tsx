import Link from "next/link";
import { Wrench, ChevronRight } from "lucide-react";

export const dynamic = "force-static";

/**
 * Temporarily disabled.
 *
 * The previous version ran several heavy aggregate queries against
 * accounts/transcripts/signals/llm_usage on every render. On the
 * Supabase shared pooler this could pin connections and starve
 * authenticated requests for the rest of the app — observed by the
 * owner as "every authenticated route hangs after clicking Plataforma".
 *
 * Replaced with a static placeholder while the queries are reworked
 * (proper indexes + cached materialized rollup, separate route per
 * section). No DB calls happen here so the page can never compete
 * for the connection pool.
 */
export default function AdminDashboardPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Plataforma</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Métricas globales de uso de nao.fyi.
        </p>
      </div>

      <section className="rounded-xl p-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Wrench size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">
              En reconstrucción
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Las queries del dashboard se estaban llevando puesto el pool
              de conexiones de Supabase y bloqueando el resto de la app. Lo
              dejé en pausa y voy a volver con una versión cacheada que se
              arme en background, no en cada visita.
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Mientras tanto las consultas siguen en{" "}
              <code className="text-xs">llm_usage</code>,{" "}
              <code className="text-xs">workspaces</code>,{" "}
              <code className="text-xs">transcripts</code> — podés mirarlas
              directo en el SQL editor de Supabase si necesitás un número.
            </p>
            <Link
              href="/app/portfolio"
              className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Volver al app
              <ChevronRight size={13} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
