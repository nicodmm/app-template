# nao.fyi Home Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `app/(public)/page.tsx` to reflect current product breadth (paid media, CRM, integrations) with stronger visual showcase, while staying inside one file.

**Architecture:** Single-file edit. Section-by-section: each task leaves the page in a working state. A local `<ShowcaseConstellation />` helper is defined inside the file and reused in hero + final CTA. All visuals built with existing primitives (`GlassCard`, `HealthStripChart`, lucide icons, Tailwind v4 + glass CSS vars).

**Tech Stack:** Next.js 15 (App Router) Server Component, React 19, Tailwind v4, shadcn/ui-style glass primitives, `lucide-react`. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-26-home-refresh-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app/(public)/page.tsx` | Modify | All section JSX + local `ShowcaseConstellation` helper |

No other files are created or modified.

---

## Task 1: Hero refresh — copy + 2-column layout + ShowcaseConstellation

**Goal:** New hero copy, 2-col layout, and a 3-card showcase to the right (reused later in CTA). Adds the lucide imports needed across the page.

**Files:**
- Modify: `app/(public)/page.tsx` (imports + hero section + add `ShowcaseConstellation` helper)

- [ ] **Step 1: Replace the lucide-react import line with the full set we'll need across the page**

Replace at top of file:

```tsx
import { CheckIcon } from "lucide-react";
```

With:

```tsx
import {
  CheckIcon,
  Activity,
  BarChart3,
  Brain,
  Circle,
  Cloud,
  Database,
  FileText,
  Folder,
  GitBranch,
  Linkedin,
  ListChecks,
  Mail,
  Megaphone,
  MessageSquare,
  Mic,
  Music2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trello,
} from "lucide-react";
import { HealthStripChart } from "@/components/health-strip-chart";
import type { WeeklyHealthBucket } from "@/lib/queries/signals";
```

- [ ] **Step 2: Add the `ShowcaseConstellation` helper above `LandingPage`**

Insert immediately above the `export default function LandingPage()` line:

```tsx
const MOCK_HEALTH_BUCKETS: WeeklyHealthBucket[] = [
  { weekStart: "2026-02-02", signal: "yellow", carryForward: false },
  { weekStart: "2026-02-09", signal: "yellow", carryForward: true },
  { weekStart: "2026-02-16", signal: "red", carryForward: false },
  { weekStart: "2026-02-23", signal: "yellow", carryForward: false },
  { weekStart: "2026-03-02", signal: "yellow", carryForward: true },
  { weekStart: "2026-03-09", signal: "green", carryForward: false },
  { weekStart: "2026-03-16", signal: "green", carryForward: true },
  { weekStart: "2026-03-23", signal: "green", carryForward: false },
  { weekStart: "2026-03-30", signal: "green", carryForward: true },
  { weekStart: "2026-04-06", signal: "green", carryForward: false },
  { weekStart: "2026-04-13", signal: "green", carryForward: true },
  { weekStart: "2026-04-20", signal: "green", carryForward: false },
];

function ShowcaseConstellation({ className }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-md ${className ?? ""}`}>
      {/* Card A — Salud */}
      <GlassCard
        variant="strong"
        className="relative z-10 -rotate-2 p-5 shadow-xl transition-transform hover:rotate-0"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-muted-foreground">Acme Corp</div>
            <div className="text-sm font-semibold">Salud de la cuenta</div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
            <TrendingUp size={12} /> +12 esta semana
          </span>
        </div>
        <HealthStripChart buckets={MOCK_HEALTH_BUCKETS} />
        <div className="mt-2 text-[11px] text-muted-foreground">Últimas 12 semanas</div>
      </GlassCard>

      {/* Card B — Señales */}
      <GlassCard
        variant="strong"
        className="relative z-20 mt-[-12px] ml-6 rotate-1 p-5 shadow-xl transition-transform hover:rotate-0"
      >
        <div className="mb-3 text-sm font-semibold">2 señales nuevas</div>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <TrendingDown size={14} />
            </span>
            <div className="text-xs leading-snug">
              <div className="font-medium text-foreground">Riesgo de churn</div>
              <div className="text-muted-foreground">Bajó frecuencia de pagos los últimos 30 días</div>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <TrendingUp size={14} />
            </span>
            <div className="text-xs leading-snug">
              <div className="font-medium text-foreground">Up-sell oportunidad</div>
              <div className="text-muted-foreground">Pidió audit de Google Ads en la última call</div>
            </div>
          </li>
        </ul>
      </GlassCard>

      {/* Card C — Próximos pasos */}
      <GlassCard
        variant="strong"
        className="relative z-30 mt-[-12px] -ml-2 -rotate-1 p-5 shadow-xl transition-transform hover:rotate-0"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Próximos pasos</div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">De la última reunión</span>
        </div>
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-xs">
            <Circle size={12} className="mt-0.5 shrink-0 text-primary/60" />
            <span>Enviar propuesta nueva campaña de retargeting</span>
          </li>
          <li className="flex items-start gap-2 text-xs">
            <Circle size={12} className="mt-0.5 shrink-0 text-primary/60" />
            <span>Revisar CTR del último flight de Meta Ads</span>
          </li>
        </ul>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 3: Replace the entire hero `<section>` block**

Find the hero section (lines starting with `{/* Hero */}` through the closing `</section>`):

```tsx
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="inline-flex items-center rounded-full px-4 py-1.5 text-xs text-muted-foreground mb-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
          Inteligencia de cuentas para agencias de growth
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-foreground mb-6">
          Siempre sabés cómo está{" "}
          <span className="text-primary">cada cuenta</span>
          <br />
          sin depender de la memoria del equipo
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground mb-8">
          Subí la transcripción de una reunión y nao.fyi extrae las tareas,
          detecta riesgos y oportunidades, y actualiza el estado de la cuenta
          automáticamente — para que tu equipo siempre tenga el contexto
          completo sin esfuerzo manual.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/signup"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            Empezá gratis — procesá tu primera transcripción
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex h-11 items-center justify-center rounded-md px-8 text-sm font-medium hover:bg-accent/50 transition-colors backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
          >
            Ya tengo cuenta
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Sin tarjeta de crédito. Plan gratuito disponible.
        </p>
      </section>
```

Replace with:

```tsx
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center rounded-full px-4 py-1.5 text-xs text-muted-foreground mb-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
              Seguimiento de cuentas con reuniones recurrentes
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-foreground mb-6">
              Sabé siempre cómo está{" "}
              <span className="text-primary">cada cuenta</span>
              <br />
              sin depender de la memoria del equipo
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground mb-8 lg:max-w-none">
              Analizá las reuniones con cada cuenta para reconocer el estado
              actual, oportunidades de cross y up-selling, tablero de paid
              media, CRM y mucho más.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                href="/auth/signup"
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Empezá gratis — procesá tu primera transcripción
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex h-11 items-center justify-center rounded-md px-8 text-sm font-medium hover:bg-accent/50 transition-colors backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
              >
                Ya tengo cuenta
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Sin tarjeta de crédito. Plan gratuito disponible.
            </p>
          </div>
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 blur-3xl opacity-60"
              style={{
                background:
                  "radial-gradient(circle at 60% 40%, hsl(243 85% 60% / 0.35), transparent 60%), radial-gradient(circle at 30% 70%, hsl(280 75% 60% / 0.25), transparent 55%)",
              }}
            />
            <ShowcaseConstellation />
          </div>
        </div>
      </section>
```

- [ ] **Step 4: Run type-check and lint**

```
npm run type-check
npm run lint
```

Expected: both pass with no errors. If lucide-react complains about a missing icon name, replace it with the closest existing one (e.g., if `Linkedin` is missing in this lucide version, use `Briefcase` and adjust label only).

- [ ] **Step 5: Visual sanity check**

Start dev server (only if not already running) and visit `/`:

```
npm run dev
```

Verify: hero has 2 columns at lg breakpoint, constellation cards stack with rotations, mobile stacks correctly. No console errors.

- [ ] **Step 6: Commit + push**

```
git add app/(public)/page.tsx
git commit -m "feat(landing): hero refresh with showcase constellation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: Integrations strip section

**Goal:** New section between hero and problem with 14 integration chips + closing line.

**Files:**
- Modify: `app/(public)/page.tsx` (insert new `<section>` between hero and problem)

- [ ] **Step 1: Insert the integrations strip section**

Find the line that starts `{/* Problem */}` and insert this entire block immediately above it:

```tsx
      {/* Integrations strip */}
      <section className="mx-auto max-w-6xl px-6 pb-12 pt-4">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground mb-5">
          Conectá todo tu stack en un solo lugar
        </p>
        <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto">
          {[
            { label: "Meta Ads", Icon: Megaphone },
            { label: "Google Ads", Icon: BarChart3 },
            { label: "LinkedIn Ads", Icon: Linkedin },
            { label: "TikTok Ads", Icon: Music2 },
            { label: "Pipedrive", Icon: Database },
            { label: "HubSpot", Icon: Database },
            { label: "Salesforce", Icon: Cloud },
            { label: "Notion", Icon: FileText },
            { label: "Asana", Icon: ListChecks },
            { label: "Trello", Icon: Trello },
            { label: "Linear", Icon: GitBranch },
            { label: "Google Drive", Icon: Folder },
            { label: "Slack", Icon: MessageSquare },
            { label: "Gmail", Icon: Mail },
          ].map(({ label, Icon }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
            >
              <Icon size={14} />
              {label}
            </span>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          ¿No ves la que necesitás?{" "}
          <a
            href="mailto:hola@nao.fyi"
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            Escribinos
          </a>{" "}
          y la armamos.
        </p>
      </section>
```

- [ ] **Step 2: Run type-check and lint**

```
npm run type-check
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Visual sanity check**

Reload `/`, verify chips wrap cleanly at all breakpoints, mailto link works.

- [ ] **Step 4: Commit + push**

```
git add app/(public)/page.tsx
git commit -m "feat(landing): add integrations strip with custom request line

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: Problem section — add icons

**Goal:** Add a lucide icon above each of the 6 problem tiles, increase padding.

**Files:**
- Modify: `app/(public)/page.tsx` (problem section)

- [ ] **Step 1: Replace the problem tiles array + render**

Find:

```tsx
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {[
              "Transcripciones de reuniones",
              "Google Ads y Meta Ads",
              "CRM y spreadsheets",
              "Notas y mails de seguimiento",
              "Asana, Notion y similares",
              "La memoria de cada AM",
            ].map((item) => (
              <GlassCard
                key={item}
                className="px-4 py-3 text-sm text-center text-muted-foreground"
              >
                {item}
              </GlassCard>
            ))}
          </div>
```

Replace with:

```tsx
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {[
              { label: "Transcripciones de reuniones", Icon: Mic },
              { label: "Google Ads y Meta Ads", Icon: BarChart3 },
              { label: "CRM y spreadsheets", Icon: Database },
              { label: "Notas y mails de seguimiento", Icon: Mail },
              { label: "Asana, Notion y similares", Icon: ListChecks },
              { label: "La memoria de cada AM", Icon: Brain },
            ].map(({ label, Icon }) => (
              <GlassCard
                key={label}
                className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-sm text-center text-muted-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon size={20} className="text-primary/70" />
                {label}
              </GlassCard>
            ))}
          </div>
```

- [ ] **Step 2: Run type-check and lint**

```
npm run type-check
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Visual sanity check**

Reload `/`, verify icons render above each tile, hover lift works.

- [ ] **Step 4: Commit + push**

```
git add app/(public)/page.tsx
git commit -m "feat(landing): add icons to problem section tiles

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: New "Todo lo que nao.fyi hace por vos" features section

**Goal:** Insert a new feature-grid section between the problem and "Cómo funciona".

**Files:**
- Modify: `app/(public)/page.tsx` (insert new `<section>` between problem and "Cómo funciona")

- [ ] **Step 1: Insert the features section**

Find the line `{/* How it works */}` and insert this entire block immediately above it:

```tsx
      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold mb-3">
          Todo lo que nao.fyi hace por vos
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
          Una sola herramienta para ver, entender y accionar sobre cada cuenta.
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              Icon: Mic,
              title: "Reuniones recurrentes",
              desc: "Procesa cada call y mantiene la línea de tiempo de la cuenta.",
            },
            {
              Icon: Activity,
              title: "Salud de cuenta",
              desc: "Score evolutivo con deltas e historial visible en un strip chart.",
            },
            {
              Icon: Sparkles,
              title: "Señales automáticas",
              desc: "Detecta riesgos, churn y oportunidades de cross y up-sell.",
            },
            {
              Icon: BarChart3,
              title: "Paid media unificado",
              desc: "Tablero de Meta y Google Ads consolidado por cliente.",
            },
            {
              Icon: Database,
              title: "CRM integrado",
              desc: "Sincronía con Pipedrive, HubSpot y otros para tener todo en un lugar.",
            },
            {
              Icon: ListChecks,
              title: "Próximos pasos",
              desc: "Tareas extraídas de cada reunión, listas para asignar al equipo.",
            },
          ].map(({ Icon, title, desc }) => (
            <GlassCard key={title} className="p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon size={20} />
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {desc}
              </p>
            </GlassCard>
          ))}
        </div>
      </section>
```

- [ ] **Step 2: Run type-check and lint**

```
npm run type-check
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Visual sanity check**

Reload `/`, verify 3-col on lg, 2-col on sm, 1-col on xs.

- [ ] **Step 4: Commit + push**

```
git add app/(public)/page.tsx
git commit -m "feat(landing): add features section with 6 product capabilities

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 5: "Cómo funciona" — rewrite step 01

**Goal:** Step 01 now talks about connecting all sources, not just transcriptions.

**Files:**
- Modify: `app/(public)/page.tsx` (how-it-works section, step 01 only)

- [ ] **Step 1: Replace step 01 in the how-it-works array**

Find:

```tsx
            {
              step: "01",
              title: "Subís la transcripción",
              desc: "Pegá el texto directamente o subí el archivo. Sin formato especial, sin configuración previa.",
            },
```

Replace with:

```tsx
            {
              step: "01",
              title: "Conectá tus fuentes",
              desc: "Sumá transcripciones, archivos de reunión, paid media (Meta/Google), CRM (Pipedrive) y más. nao.fyi unifica todo en el contexto de cada cuenta.",
            },
```

- [ ] **Step 2: Run type-check and lint**

```
npm run type-check
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit + push**

```
git add app/(public)/page.tsx
git commit -m "feat(landing): broaden 'Cómo funciona' step 01 to connect sources

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 6: FAQ rewrite

**Goal:** Replace the 5 FAQ entries with the new versions covering paid media, sources, etc.

**Files:**
- Modify: `app/(public)/page.tsx` (FAQ section data array)

- [ ] **Step 1: Replace the FAQ entries array**

Find:

```tsx
            {[
              {
                q: "¿Qué formatos de transcripción acepta?",
                a: "Podés pegar el texto directamente en la app o subir un archivo .txt, .md, .docx o .pdf. También podés conectar Google Drive y nao.fyi importa los archivos automáticamente, matcheándolos al nombre de la cuenta.",
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
```

Replace with:

```tsx
            {[
              {
                q: "¿Qué fuentes puedo conectar?",
                a: "Transcripciones (.txt, .md, .docx, .pdf), Google Drive con import automático, Meta Ads y Google Ads para paid media, y Pipedrive para CRM. Más integraciones (HubSpot, Asana, Trello, Notion, Slack) en roadmap. ¿Te falta alguna? Escribinos a hola@nao.fyi y la armamos.",
              },
              {
                q: "¿Cuántas cuentas puedo gestionar?",
                a: "Depende del plan: Free permite 2 cuentas, Starter hasta 10 y Pro hasta 30. Si necesitás más, contactanos para un plan Enterprise.",
              },
              {
                q: "¿Funciona con paid media de mis clientes?",
                a: "Sí. Conectás cuentas de Meta Ads y Google Ads en el plan Pro y nao.fyi cruza el performance de cada campaña con el contexto conversacional de la cuenta — para que el equipo entienda el porqué detrás de cada métrica.",
              },
              {
                q: "¿Qué pasa si el AI extrae mal una tarea o señal?",
                a: "Todo lo que genera el AI es editable. Podés corregir tareas, señales y resúmenes directamente desde la cuenta, y agregar notas manuales en cualquier momento.",
              },
              {
                q: "¿Los datos son privados y seguros?",
                a: "Sí. Los datos se almacenan en servidores seguros (Supabase / AWS) y nunca se comparten con terceros. Las transcripciones se usan solo para el procesamiento de tu cuenta.",
              },
            ].map((item) => (
```

- [ ] **Step 2: Run type-check and lint**

```
npm run type-check
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit + push**

```
git add app/(public)/page.tsx
git commit -m "feat(landing): rewrite FAQ to cover paid media, CRM, and integrations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 7: Final CTA — 2 columns + showcase echo

**Goal:** Replace the existing CTA card with a 2-column layout: text+benefits left, `<ShowcaseConstellation />` right. Stronger gradient.

**Files:**
- Modify: `app/(public)/page.tsx` (final CTA section)

- [ ] **Step 1: Replace the CTA section**

Find:

```tsx
      {/* CTA footer */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <GlassCard
          variant="strong"
          className="px-8 py-14 text-center relative overflow-hidden"
        >
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-90"
            style={{
              background:
                "radial-gradient(circle at 30% 50%, hsl(243 85% 60% / 0.35), transparent 60%), radial-gradient(circle at 75% 30%, hsl(280 75% 60% / 0.25), transparent 55%)",
            }}
          />
          <h2 className="text-2xl font-bold text-foreground mb-3">
            Empezá a gestionar tu cartera con claridad
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Gratis. Sin tarjeta de crédito. Tu primer transcript en menos de un minuto.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex h-11 items-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30"
          >
            Crear cuenta gratuita
          </Link>
        </GlassCard>
      </section>
```

Replace with:

```tsx
      {/* CTA footer */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <GlassCard
          variant="strong"
          className="relative overflow-hidden px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
        >
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(circle at 25% 50%, hsl(243 85% 60% / 0.45), transparent 60%), radial-gradient(circle at 80% 30%, hsl(280 75% 60% / 0.35), transparent 55%), radial-gradient(circle at 50% 100%, hsl(200 85% 60% / 0.25), transparent 60%)",
            }}
          />
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="text-center lg:text-left">
              <h2 className="text-3xl font-bold text-foreground mb-4 sm:text-4xl">
                Empezá a gestionar tu cartera con claridad
              </h2>
              <ul className="mb-8 space-y-2 inline-block text-left">
                {[
                  "Sin tarjeta de crédito",
                  "Primer transcript en menos de un minuto",
                  "Cancelás cuando quieras",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckIcon size={16} className="mt-0.5 shrink-0 text-success" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Link
                  href="/auth/signup"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30"
                >
                  Crear cuenta gratuita
                </Link>
                <Link
                  href="/auth/login"
                  className="inline-flex h-11 items-center justify-center rounded-md px-8 text-sm font-medium hover:bg-accent/50 transition-colors backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
                >
                  Ya tengo cuenta
                </Link>
              </div>
            </div>
            <div className="relative">
              <ShowcaseConstellation />
            </div>
          </div>
        </GlassCard>
      </section>
```

- [ ] **Step 2: Run type-check and lint**

```
npm run type-check
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Visual sanity check**

Reload `/`, scroll to bottom, verify CTA has 2 columns + constellation echoes the hero. Mobile stacks correctly.

- [ ] **Step 4: Commit + push**

```
git add app/(public)/page.tsx
git commit -m "feat(landing): refresh final CTA with 2-col layout and showcase echo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 8: Final verification

**Goal:** End-to-end check that nothing regressed across the page.

- [ ] **Step 1: Type-check + lint clean**

```
npm run type-check
npm run lint
```

Expected: both pass with no errors.

- [ ] **Step 2: Manual walk-through at 1440px (desktop)**

Open `/` in a desktop browser. Walk top → bottom and verify:
- Hero: 2 columns, eyebrow + new H1 + new sub + CTAs left, constellation right with rotations.
- Integrations strip: 14 chips wrap into 2-3 rows centered, "Escribinos" link active.
- Problem: each tile shows icon above label, hover lift on tiles.
- Features: 3-col grid of 6 cards, each with icon in primary tint.
- Cómo funciona: step 01 shows new title "Conectá tus fuentes" + new description.
- Pricing: unchanged.
- FAQ: 5 entries, first one is "¿Qué fuentes puedo conectar?".
- Final CTA: 2-col with constellation right, 3 benefit checks left, two CTAs.
- Footer: unchanged.
- No console errors.

- [ ] **Step 3: Manual walk-through at 375px (mobile)**

Resize to 375px (or use device emulation). Verify everything stacks cleanly:
- Hero text first, then constellation below.
- Integration chips wrap across many rows but readable.
- Problem grid 2-col.
- Features grid 1-col.
- CTA stacks text first, constellation below.

- [ ] **Step 4: No commit needed if walk-throughs pass**

If you found issues, fix them in a final commit:

```
git add app/(public)/page.tsx
git commit -m "fix(landing): polish from end-to-end review"
git push
```
