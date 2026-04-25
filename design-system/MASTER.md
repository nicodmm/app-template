# nao.fyi — Design System (Master)

**Style:** Glassmorphism (frosted glass surfaces over a subtly tinted gradient + orb-lit background)
**Stack:** Next.js 15 + React 19 + Tailwind v4 + shadcn/ui primitives
**Date:** 2026-04-25
**Source of truth.** Page overrides live under `design-system/pages/<page>.md` and only deviate when justified.

---

## Core Decisions

1. **Primary color stays.** Signal Indigo (`hsl(243 75% 58%)` light / `hsl(243 70% 63%)` dark) is the brand. Glass surfaces refract it.
2. **Glassmorphism applies to surfaces, not the whole UI.** Cards, sheets, sidebar, header, modals = glass. Body text, buttons, form inputs = flat for legibility.
3. **Background is layered** so glass has something to blur:
   - Base: subtle gradient (off-white → faint indigo tint in light; deep indigo-black → near-black in dark).
   - Decorative blurred orbs (3 max per route, fixed positions, no animation by default — animation only on landing).
   - Optional fine grain noise overlay (5–8% opacity SVG) to keep it from looking sterile.
4. **Dark mode is the hero.** Glass shines on dark surfaces; we polish dark first, then verify light.
5. **Typography upgrade:** drop Arial. Use **Geist Sans** (variable, free, MIT) as body and **Geist** with tighter tracking + heavier weight for headings. Optional: **Geist Mono** for numeric-heavy tables (KPIs, deal amounts).
6. **No emoji as structural icons.** Already on Lucide — keep it that way.

---

## Tokens (CSS variables, added to `app/globals.css`)

```css
/* Glass surface tokens */
--glass-bg: rgba(255, 255, 255, 0.55);          /* light card */
--glass-bg-strong: rgba(255, 255, 255, 0.72);   /* light modal/popover */
--glass-border: rgba(255, 255, 255, 0.65);
--glass-shadow: 0 8px 32px -12px rgba(15, 18, 53, 0.18),
                0 1px 0 rgba(255, 255, 255, 0.6) inset;
--glass-blur: 20px;
--glass-blur-strong: 28px;

/* Dark variants */
--glass-bg:        rgba(30, 32, 64, 0.45);
--glass-bg-strong: rgba(40, 42, 80, 0.65);
--glass-border:    rgba(255, 255, 255, 0.08);
--glass-shadow:    0 12px 40px -16px rgba(0, 0, 0, 0.6),
                   0 1px 0 rgba(255, 255, 255, 0.05) inset;

/* Background orb tints (apply via radial-gradient) */
--orb-1: hsl(243 75% 58% / 0.18);  /* indigo */
--orb-2: hsl(190 80% 55% / 0.12);  /* cyan */
--orb-3: hsl(280 70% 60% / 0.10);  /* violet */
```

Border radius bumps from `0.5rem` → `0.75rem` for cards (glass reads better at md-lg corners). Inputs and buttons stay at `0.5rem`.

---

## Component Patterns

| Pattern | Recipe |
|---|---|
| **Glass card** | `bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] border border-[var(--glass-border)] rounded-xl shadow-[var(--glass-shadow)]` |
| **Glass card strong** (modal, popover) | Same + `--glass-bg-strong` and `--glass-blur-strong` |
| **App sidebar** | Glass card, fixed, full-height; in dark mode lean even more transparent (~30%) |
| **App header** | Glass card, sticky top, lighter backdrop (~`blur-[14px]`) so content shows through subtly |
| **KPI tile** | Glass card + numeric value in Geist Mono + label in muted-foreground |
| **Health badge** | NOT glass — flat semantic chips (existing pattern stays); add icon next to color so it's not color-only (a11y) |
| **Dialog/Sheet** | Glass card strong + a 40-50% black scrim behind |
| **Buttons** | Stay flat. Primary = solid indigo, ghost = transparent + hover bg `--accent`. Glass buttons look weak. |
| **Inputs** | Subtle frosted: `bg-white/40 dark:bg-white/5 backdrop-blur-sm border-[var(--glass-border)]`. |
| **Tables** | Body rows flat (max contrast for data). Header row glass. Outer container is a glass card. |

---

## Anti-patterns (do not do)

- ❌ Glass over busy photographic backgrounds → contrast collapses. We control the bg, so this is fine.
- ❌ Stacking glass on glass on glass — max 2 layers (background → glass card → flat content inside).
- ❌ Animating `backdrop-filter` on hover (jank). Animate `border-color`/`background-color` instead.
- ❌ Color-only meaning (red/green/yellow health) → always pair with icon or label. (Existing badge already has label; strip chart needs icons or shape diff.)
- ❌ Glass on form inputs in error state → flat red border + clear text wins.
- ❌ Decorative blur (background blur for "vibes" without semantic purpose). Background uses gradient + orbs, not blur.

---

## Accessibility floor

- All text on glass ≥ 4.5:1 contrast. Verify each glass token pair manually after implementation.
- Focus rings: 2px solid `var(--ring)` with 2px offset; never removed.
- `prefers-reduced-motion`: disable orb animation on landing.
- `prefers-reduced-transparency` (Safari/iOS): swap glass tokens to opaque fallbacks (provide `@media (prefers-reduced-transparency: reduce)` override).

---

## Phased Rollout

**Phase 1 — Foundation** (this session)
- [ ] Install Geist font via `next/font/google`
- [ ] Add glass tokens to `globals.css`
- [ ] Add background gradient + orb component (`<AppBackground />`) used in both `(public)` and `(protected)` layouts
- [ ] Build glass primitive components: `<GlassCard />`, `<GlassPanel />` (strong variant), `<GlassDialog />`
- [ ] Update `<Button />` only if needed (probably keep)
- [ ] Verify dark mode contrast

**Phase 2 — Public web**
- Landing (`app/(public)/page.tsx`) — full glassmorphism showcase, animated orbs, hero copy
- Login / signup / reset-password — centered glass card on gradient

**Phase 3 — App shell**
- Sidebar → glass
- Header → glass
- Page wrapper / breadcrumbs → adopt new spacing

**Phase 4 — Portfolio + Account detail**
- Portfolio cards → glass
- Account detail page: header KPIs → glass tiles, tabs → glass strip, sections → glass cards
- **Strip chart de salud** lands here (sub-project G integrated into the redesign)
- Health timeline shows justification per entry

**Phase 5 — Remaining surfaces**
- Settings (workspace, integrations) → glass
- Paid Media (campaigns/ads tables) → glass container, flat rows
- CRM (deals, funnel) → glass

**Phase 6 — Polish pass**
- Reduced-motion audit
- Mobile (375px) audit — orbs may need to scale down
- Light-mode contrast verification on every page

---

## Page Override Convention

When a page needs to deviate (e.g., landing has animated orbs that other pages don't), create `design-system/pages/<page>.md` and the override only documents what changes from this Master. Do not duplicate the whole system.

Examples we'll need:
- `pages/landing.md` — animated orbs, larger hero typography, video/screenshot frame inside glass
- `pages/account-detail.md` — strip chart specs, tab strip variant
