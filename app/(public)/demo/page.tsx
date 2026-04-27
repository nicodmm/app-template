import Link from "next/link";
import { ArrowRight, BarChart2, Briefcase, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

export default function DemoLandingPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 sm:p-10 space-y-8">
      <div className="space-y-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <Sparkles size={13} aria-hidden /> Demo interactivo
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
          Así se ve nao.fyi cuando tu agencia tiene 8 cuentas en marcha
        </h1>
        <p className="text-base text-muted-foreground">
          Estás viendo el workspace ficticio de <strong>Bloom Marketing</strong>
          , una agencia de growth con clientes reales-pero-no. Datos, métricas
          y conversaciones inventadas. Podés navegar todo como si fueras el
          dueño de la cuenta.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/demo/dashboard"
          className="group block rounded-xl p-5 backdrop-blur-[14px] transition-all [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] hover:[background:var(--glass-bg-strong)] hover:translate-y-[-1px]"
        >
          <div className="flex items-center justify-between mb-2">
            <BarChart2 size={20} className="text-primary" />
            <ArrowRight
              size={16}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          <h2 className="font-semibold mb-1">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            KPIs del portfolio, distribución de salud, top de actividad,
            industrias y tamaños — con drill-down.
          </p>
        </Link>
        <Link
          href="/demo/portfolio"
          className="group block rounded-xl p-5 backdrop-blur-[14px] transition-all [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] hover:[background:var(--glass-bg-strong)] hover:translate-y-[-1px]"
        >
          <div className="flex items-center justify-between mb-2">
            <Briefcase size={20} className="text-primary" />
            <ArrowRight
              size={16}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          <h2 className="font-semibold mb-1">Portfolio</h2>
          <p className="text-sm text-muted-foreground">
            Todas las cuentas activas con su estado de salud. Hacé click en
            cualquiera para ver el detalle completo.
          </p>
        </Link>
      </div>

      <GlassCard className="p-5">
        <h3 className="font-semibold mb-2 text-sm">¿Qué hay en cada cuenta?</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>
            • <strong className="text-foreground">Resumen IA</strong> — ficha
            estratégica autoescrita por Claude
          </li>
          <li>
            • <strong className="text-foreground">Última reunión</strong> con
            transcripción procesada
          </li>
          <li>
            • <strong className="text-foreground">Paid media</strong> con
            métricas de campañas y anuncios (con nombres internos editables)
          </li>
          <li>
            • <strong className="text-foreground">CRM</strong> sincronizado con
            Pipedrive
          </li>
          <li>
            • <strong className="text-foreground">Tareas</strong>,{" "}
            <strong className="text-foreground">señales</strong> de upsell y
            riesgo, <strong className="text-foreground">salud histórica</strong>
          </li>
          <li>
            •{" "}
            <strong className="text-foreground">
              Vista pública compartible
            </strong>{" "}
            con tu cliente final (read-only, con módulos visibles
            configurables)
          </li>
        </ul>
      </GlassCard>

      <p className="text-xs text-muted-foreground text-center">
        Este demo es read-only. Los botones de editar, crear y borrar están
        deshabilitados — para interactuar con datos reales,{" "}
        <Link href="/auth/signup" className="underline">
          creá tu cuenta
        </Link>
        .
      </p>
    </div>
  );
}
