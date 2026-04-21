import Link from "next/link";
import { CheckIcon } from "lucide-react";

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground mb-6">
          Inteligencia de cuentas para agencias de growth
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-foreground mb-6">
          Siempre sabés cómo está{" "}
          <span className="text-primary">cada cuenta</span>
          <br />
          sin depender de la memoria del equipo
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground mb-8">
          Subí la transcripción de una reunión y plani.fyi extrae las tareas,
          detecta riesgos y oportunidades, y actualiza el estado de la cuenta
          automáticamente — para que tu equipo siempre tenga el contexto
          completo sin esfuerzo manual.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/signup"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Empezá gratis — procesá tu primera transcripción
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border px-8 text-sm font-medium hover:bg-accent transition-colors"
          >
            Ya tengo cuenta
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Sin tarjeta de crédito. Plan gratuito disponible.
        </p>
      </section>

      {/* Problem */}
      <section className="bg-muted/50 border-y border-border">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-center text-sm font-medium text-muted-foreground mb-8 uppercase tracking-wider">
            La información crítica de cada cliente está dispersa en
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {[
              "Transcripciones de reuniones",
              "Google Ads y Meta Ads",
              "CRM y spreadsheets",
              "Notas y mails de seguimiento",
              "Asana, Notion y similares",
              "La memoria de cada AM",
            ].map((item) => (
              <div
                key={item}
                className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-center text-muted-foreground"
              >
                {item}
              </div>
            ))}
          </div>
          <p className="text-center text-base font-medium text-foreground mt-8 max-w-xl mx-auto">
            El resultado: el seguimiento depende de quién recuerda qué, las
            tareas se pierden y los riesgos se detectan tarde.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold mb-3">Cómo funciona</h2>
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
          Tres pasos para pasar de una reunión caótica a un estado de cuenta
          claro y accionable.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Subís la transcripción",
              desc: "Pegá el texto directamente o subí el archivo. Sin formato especial, sin configuración previa.",
            },
            {
              step: "02",
              title: "La IA procesa en segundos",
              desc: "plani.fyi extrae tareas y próximos pasos, genera el resumen de situación y detecta señales de riesgo u oportunidad.",
            },
            {
              step: "03",
              title: "Tu equipo siempre está al día",
              desc: "El portfolio se actualiza solo. Cualquiera del equipo puede abrir una cuenta y entender el contexto completo al instante.",
            },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-border bg-card p-6">
              <div className="text-3xl font-bold text-primary/20 mb-3">
                {item.step}
              </div>
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-muted/50 border-y border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-2xl font-bold mb-3">Planes y precios</h2>
          <p className="text-center text-muted-foreground mb-12">
            Empezá gratis, escalá cuando lo necesites.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {/* Free */}
            <div className="rounded-xl border border-border bg-background p-6 flex flex-col">
              <div className="mb-4">
                <div className="text-sm font-medium text-muted-foreground mb-1">Free</div>
                <div className="text-3xl font-bold">$0</div>
                <div className="text-sm text-muted-foreground">para siempre</div>
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {[
                  "Hasta 2 cuentas activas",
                  "5 transcripciones por mes",
                  "Extracción de tareas y resumen",
                  "Señales de salud básicas",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckIcon size={14} className="mt-0.5 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className="block text-center rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Empezar gratis
              </Link>
            </div>

            {/* Starter */}
            <div className="rounded-xl border-2 border-primary bg-background p-6 flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  Más popular
                </span>
              </div>
              <div className="mb-4">
                <div className="text-sm font-medium text-muted-foreground mb-1">Starter</div>
                <div className="text-3xl font-bold">$49</div>
                <div className="text-sm text-muted-foreground">por mes</div>
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {[
                  "Hasta 10 cuentas activas",
                  "30 transcripciones por mes",
                  "Dashboard de portfolio",
                  "Detección completa de señales",
                  "Historial completo",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckIcon size={14} className="mt-0.5 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className="block text-center rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Empezar con Starter
              </Link>
            </div>

            {/* Pro */}
            <div className="rounded-xl border border-border bg-background p-6 flex flex-col">
              <div className="mb-4">
                <div className="text-sm font-medium text-muted-foreground mb-1">Pro</div>
                <div className="text-3xl font-bold">$99</div>
                <div className="text-sm text-muted-foreground">por mes</div>
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {[
                  "Hasta 30 cuentas activas",
                  "Transcripciones ilimitadas",
                  "Todo lo de Starter",
                  "Integraciones de ads (Meta, Google)",
                  "Configuración flexible por cuenta",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckIcon size={14} className="mt-0.5 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className="block text-center rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Empezar con Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold mb-12">Preguntas frecuentes</h2>
        <div className="space-y-6">
          {[
            {
              q: "¿Qué formatos de transcripción acepta?",
              a: "Podés pegar el texto directamente en la app o subir un archivo .txt. El soporte para .docx está en desarrollo.",
            },
            {
              q: "¿Cuántas cuentas puedo gestionar?",
              a: "Depende del plan: Free permite 2 cuentas, Starter hasta 10 y Pro hasta 30. Si necesitás más, contactanos para un plan Enterprise.",
            },
            {
              q: "¿Los clientes pueden ver su cuenta?",
              a: "La vista de cliente (read-only) está en desarrollo para el plan Pro. Por ahora el acceso es solo para el equipo interno.",
            },
            {
              q: "¿Qué pasa si el AI no extrae bien una tarea o señal?",
              a: "Todo lo que genera el AI es editable. Podés corregir tareas, señales y resúmenes directamente desde la cuenta, y también agregar notas manuales en cualquier momento.",
            },
            {
              q: "¿Los datos son privados y seguros?",
              a: "Sí. Los datos se almacenan en servidores seguros (Supabase / AWS) y nunca se comparten con terceros. Las transcripciones se usan solo para el procesamiento de tu cuenta.",
            },
          ].map((item) => (
            <div key={item.q} className="border-b border-border pb-6">
              <h3 className="font-medium mb-2">{item.q}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA footer */}
      <section className="bg-primary">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-primary-foreground mb-3">
            Empezá a gestionar tu cartera con claridad
          </h2>
          <p className="text-primary-foreground/70 mb-8 max-w-xl mx-auto">
            Gratis. Sin tarjeta de crédito. Tu primer transcript en menos de un minuto.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex h-11 items-center rounded-md bg-background text-foreground hover:bg-background/90 transition-colors px-8 text-sm font-medium"
          >
            Crear cuenta gratuita
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">plani.fyi</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacidad
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Términos
            </Link>
          </div>
          <span>© {new Date().getFullYear()} plani.fyi</span>
        </div>
      </footer>
    </main>
  );
}
