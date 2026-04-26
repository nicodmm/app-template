# nao.fyi — Home page refresh

**Date:** 2026-04-26
**Owner:** nicodmatutem@gmail.com
**File touched:** `app/(public)/page.tsx` (single file, no new components)

## Goal

Bring the public landing from "MVP-feel" to a product-confident page that reflects the current breadth of nao.fyi (paid media, CRM, integrations) without going corporate. Update copy to match current positioning and add visual showcase of the product.

## Non-goals

- Mobile nav redesign (deferred per project memory)
- Route, auth, data, or i18n changes
- Brand/SVG logo assets — use lucide icons + text labels for integrations
- Replacing the existing color/glass system — reuse it

## Constraints

- Single file (`app/(public)/page.tsx`). Local sub-components allowed inline; no new top-level files unless duplication forces it.
- Reuse existing primitives: `GlassCard`, `HealthStripChart` (`components/health-strip-chart.tsx`), lucide icons. No new chart libs.
- Tailwind v4 + existing CSS vars (`--glass-bg`, `--glass-border`, `--glass-shadow`).
- Copy is in Spanish, voseo, imperative tone.

## Section-by-section

### 1. Hero — 2-column, text + showcase constellation

**Layout:** `lg:grid-cols-2` (text left, showcase right). On `< lg` it stacks (text first, showcase below). Container widens from `max-w-5xl` to `max-w-6xl` to fit two columns comfortably.

**Text column (left, left-aligned on lg, centered on mobile):**
- Eyebrow tag: **"Seguimiento de cuentas con reuniones recurrentes"**
- H1: **"Sabé siempre cómo está cada cuenta sin depender de la memoria del equipo"** with `cada cuenta` in `text-primary`
- Sub: **"Analizá las reuniones con cada cuenta para reconocer el estado actual, oportunidades de cross y up-selling, tablero de paid media, CRM y mucho más."**
- CTAs unchanged: primary "Empezá gratis — procesá tu primera transcripción" + ghost "Ya tengo cuenta"
- Microcopy unchanged: "Sin tarjeta de crédito. Plan gratuito disponible."

**Showcase column (right):** A `ShowcaseConstellation` group of 3 stacked, slightly rotated `GlassCard`s. Implemented as a local component within the file (reused in the final CTA).
- **Card A — Salud de la cuenta** (rotated `-rotate-2`, top): label "Acme Corp · Salud" + `<HealthStripChart>` with 12 mock `WeeklyHealthBucket` items (shape from `lib/queries/signals`: `weekStart` ISO, `signal` one of `green | yellow | red | inactive`, `carriedForward` boolean) — sequence trends from yellow → green to read as recovering. Delta pill "+12 esta semana" (`text-success`).
- **Card B — Señales detectadas** (rotated `rotate-1`, middle, slight `translate-x-4`): header "2 señales nuevas" + 2 chip rows:
  - 🟡 `TrendingDown` "Riesgo de churn" — *"Bajó frecuencia de pagos"*
  - 🟢 `TrendingUp` "Up-sell oportunidad" — *"Pidió audit de Google Ads"*
- **Card C — Próximos pasos** (rotated `-rotate-1`, bottom, slight `-translate-x-4`): header "De la última reunión" + 2 checklist rows with `Circle` icon: "Enviar propuesta nueva campaña" / "Revisar CTR último flight"

All cards use `GlassCard variant="strong"` for solidity. Mock data is hardcoded inside the component.

### 2. Integrations strip (NEW, between hero and problem)

Compact horizontal section, no big heading. One small label + a wrap-flex of glass chips with icon + text.

- Label (centered, small caps): "Conectá todo tu stack en un solo lugar"
- Chips (lucide icon + label, glass tile, `px-3 py-1.5`, hover lift):
  - Meta Ads (`Megaphone`)
  - Google Ads (`BarChart3`)
  - LinkedIn Ads (`Linkedin`)
  - TikTok Ads (`Music2`)
  - Pipedrive (`Database`)
  - HubSpot (`Database`)
  - Salesforce (`Cloud`)
  - Notion (`FileText`)
  - Asana (`ListChecks`)
  - Trello (`Trello`)
  - Linear (`GitBranch`)
  - Google Drive (`Folder`)
  - Slack (`MessageSquare`)
  - Gmail (`Mail`)

Some are flagged as "Próximamente" via small muted badge if needed — for now we list them all without badges (the user wants to look robust). The icons are approximate (no brand logos used to avoid trademark issues).

**Footer line (under the chips, centered, small `text-muted-foreground`):** *"¿No ves la que necesitás? Escribinos y la armamos."* — with "Escribinos" as a `mailto:hola@nao.fyi` link (this is the real address already used in privacy/terms pages).

### 3. Problem section — visual upgrade

Keep the 6 items + final sentence. Changes:
- Each `GlassCard` gets a lucide icon centered above the text:
  - "Transcripciones de reuniones" → `Mic`
  - "Google Ads y Meta Ads" → `BarChart3`
  - "CRM y spreadsheets" → `Database`
  - "Notas y mails de seguimiento" → `Mail`
  - "Asana, Notion y similares" → `ListChecks`
  - "La memoria de cada AM" → `Brain`
- Tiles get `py-6` instead of `py-3`, icon `size={20}` `text-primary/70`, hover `translate-y-[-2px]` transition.

### 4. Features section (NEW, between problem and "Cómo funciona")

Title: **"Todo lo que nao.fyi hace por vos"**
Sub: "Una sola herramienta para ver, entender y accionar sobre cada cuenta."

3-col grid of 6 `GlassCard`s, each with lucide icon + title + 1-line description:

| Icon | Title | Description |
|---|---|---|
| `Mic` | Reuniones recurrentes | Procesa cada call y mantiene la línea de tiempo de la cuenta. |
| `Activity` | Salud de cuenta | Score evolutivo con deltas e historial visible. |
| `Sparkles` | Señales automáticas | Detecta riesgos, churn y oportunidades de cross/up-sell. |
| `BarChart3` | Paid media unificado | Tablero de Meta y Google Ads consolidado por cliente. |
| `Database` | CRM integrado | Sincronía con Pipedrive, HubSpot y otros para tener todo en un lugar. |
| `ListChecks` | Próximos pasos | Tareas extraídas de cada reunión, listas para asignar al equipo. |

### 5. Cómo funciona — repurpose step 01

Step 01 retitled and rewritten. Steps 02 and 03 unchanged.

| Step | Title | Description |
|---|---|---|
| 01 | **Conectá tus fuentes** | **Sumá transcripciones, archivos de reunión, paid media (Meta/Google), CRM (Pipedrive) y más. nao.fyi unifica todo en el contexto de cada cuenta.** |
| 02 | La IA procesa en segundos | (sin cambios) |
| 03 | Tu equipo siempre está al día | (sin cambios) |

### 6. Pricing — unchanged

### 7. FAQ — rewritten

5 entries, replacing the current set:

1. **¿Qué fuentes puedo conectar?**
   *Transcripciones (.txt, .md, .docx, .pdf), Google Drive con import automático, Meta Ads y Google Ads para paid media, y Pipedrive para CRM. Más integraciones (HubSpot, Asana, Trello, Notion, Slack) en roadmap.*

2. **¿Cuántas cuentas puedo gestionar?**
   *Depende del plan: Free permite 2 cuentas, Starter hasta 10 y Pro hasta 30. Si necesitás más, contactanos para un plan Enterprise.*

3. **¿Funciona con paid media de mis clientes?**
   *Sí. Conectás cuentas de Meta Ads y Google Ads en el plan Pro y nao.fyi cruza el performance de cada campaña con el contexto conversacional de la cuenta — para que el equipo entienda el porqué detrás de cada métrica.*

4. **¿Qué pasa si el AI extrae mal una tarea o señal?**
   *Todo lo que genera el AI es editable. Podés corregir tareas, señales y resúmenes directamente desde la cuenta, y agregar notas manuales en cualquier momento.*

5. **¿Los datos son privados y seguros?**
   *Sí. Los datos se almacenan en servidores seguros (Supabase / AWS) y nunca se comparten con terceros. Las transcripciones se usan solo para el procesamiento de tu cuenta.*

### 8. Final CTA — 2-column with constellation echo

Wrap in a single `GlassCard variant="strong"` with stronger gradient:
- Background: 2 radial blobs (`hsl(243 85% 60% / 0.45)` at 25/50 + `hsl(280 75% 60% / 0.35)` at 80/30) + a subtle conic shimmer.
- Layout `lg:grid-cols-2 gap-10 items-center`:
  - **Left column (text):**
    - H2: "Empezá a gestionar tu cartera con claridad" (size up to `text-3xl`)
    - 3 benefit checks (`Check` icon, `text-success`):
      - Sin tarjeta de crédito
      - Primer transcript en menos de un minuto
      - Cancelás cuando quieras
    - 2 CTAs side by side: primary "Crear cuenta gratuita" + ghost "Ya tengo cuenta"
  - **Right column:** reuse `<ShowcaseConstellation />` from hero. Echoes opening visually.
- On `< lg`: stack — text first, showcase below, all centered.

### 9. Footer — unchanged

## Section order (top to bottom)

1. Hero (text + constellation)
2. Integrations strip (NEW)
3. Problem (icons added)
4. Features (NEW)
5. Cómo funciona (step 01 rewritten)
6. Pricing
7. FAQ (rewritten)
8. Final CTA (2-col + constellation)
9. Footer

## Reused components

- `GlassCard` (existing, both `default` and `strong` variants)
- `HealthStripChart` (existing client component) — used inside Card A of the constellation. Props are serializable, so it can be rendered from the server `page.tsx` directly.
- lucide-react icons (already a dependency based on existing `CheckIcon` import)

## Local helpers

A local `<ShowcaseConstellation />` defined inside `page.tsx` (not exported), reused in hero and final CTA. Mock data hardcoded. Pure JSX (no hooks, no event handlers) so it stays server-renderable. Visual life comes from CSS-only effects (rotations, transitions on hover, gradient backgrounds).

## Verification

- `npm run type-check` clean
- `npm run lint` clean
- `npm run dev` and visit `/` — verify:
  - Hero renders 2 columns at lg, stacks at md/sm
  - Constellation cards rotate/offset visibly without overlapping CTAs
  - Integrations strip wraps cleanly
  - Problem icons render
  - Features grid renders 3-col at lg, 2-col at sm, 1-col at xs
  - FAQ shows 5 new entries
  - Final CTA stronger than current
- No console errors
- Mobile (375 width) and desktop (1440 width) both look polished
