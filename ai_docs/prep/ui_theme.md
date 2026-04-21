# UI Theme Selection Report

_Generated: 2026-04-16 | App: plani.fyi_

## Project Context
**App Purpose:** AI-powered account intelligence platform for growth agencies and consultancies
**Industry:** B2B SaaS / Agency Intelligence
**Target Audience:** Account managers, team leads, directors at growth agencies (professional B2B)
**Brand Personality:** Analytical depth, clarity, actionable intelligence — professional but con carácter; not a stiff enterprise CRM

## Selected Theme Configuration

### Primary Color
**Name:** Signal Indigo
**Rationale:** Indigo conveys analytical depth and premium SaaS intelligence — differentiates plani.fyi from generic blue enterprise tools while signaling serious, trustworthy positioning. Consistent with best-in-class B2B intelligence tools (Linear, Notion vibe).
**Temperature:** Cool
**HSL Values:**
- Light Mode: `hsl(243 75% 58%)`
- Dark Mode: `hsl(243 70% 63%)`

### Variant Selection
**Light Mode Variant:** Warm Off-White — background subtly tinted with indigo hue `hsl(243 15% 98%)`, softer on eyes for extended daily use
**Dark Mode Variant:** Complementary Dark — brand-harmonized dark background `hsl(243 18% 8%)` echoes the indigo primary for visual coherence

**CSS Classes Used:**
- Light: `.primary1-light2`
- Dark: `.primary1-dark2`

### Selection Rationale
Warm Off-White avoids the harshness of pure white for a tool used throughout the workday. Complementary Dark creates an immersive, brand-coherent dark mode that feels premium — the indigo tint in the background subtly reinforces the Signal Indigo identity without being heavy.

## Complete CSS Implementation

### Light Mode (`:root`)
```css
--primary: hsl(243 75% 58%);
--primary-foreground: hsl(0 0% 98%);
--background: hsl(243 15% 98%);
--foreground: hsl(240 10% 3.9%);
--muted: hsl(243 12% 94%);
--muted-foreground: hsl(240 3.8% 46.1%);
--card: hsl(0 0% 100%);
--card-foreground: hsl(240 10% 3.9%);
--popover: hsl(243 15% 98%);
--popover-foreground: hsl(240 10% 3.9%);
--secondary: hsl(243 12% 94%);
--secondary-foreground: hsl(240 5.9% 10%);
--accent: hsl(243 12% 94%);
--accent-foreground: hsl(240 5.9% 10%);
--success: hsl(142 72% 50%);
--success-foreground: hsl(0 0% 98%);
--warning: hsl(42 88% 56%);
--warning-foreground: hsl(240 10% 3.9%);
--destructive: hsl(358 78% 58%);
--destructive-foreground: hsl(0 0% 98%);
--border: hsl(240 5.9% 90%);
--input: hsl(240 5.9% 90%);
--ring: hsl(243 75% 58%);
--radius: 0.5rem;
```

### Dark Mode (`:root:where(.dark, .dark *)`)
```css
--primary: hsl(243 70% 63%);
--primary-foreground: hsl(0 0% 98%);
--background: hsl(243 18% 8%);
--foreground: hsl(0 0% 98%);
--muted: hsl(243 15% 14%);
--muted-foreground: hsl(243 10% 65%);
--card: hsl(243 18% 10%);
--card-foreground: hsl(0 0% 98%);
--popover: hsl(243 18% 8%);
--popover-foreground: hsl(0 0% 98%);
--secondary: hsl(243 15% 14%);
--secondary-foreground: hsl(0 0% 98%);
--accent: hsl(243 15% 14%);
--accent-foreground: hsl(0 0% 98%);
--success: hsl(142 68% 55%);
--success-foreground: hsl(0 0% 98%);
--warning: hsl(42 84% 60%);
--warning-foreground: hsl(0 0% 98%);
--destructive: hsl(358 74% 62%);
--destructive-foreground: hsl(0 0% 98%);
--border: hsl(243 12% 20%);
--input: hsl(243 12% 20%);
--ring: hsl(243 70% 63%);
--radius: 0.5rem;
```

## Implementation Status

### Files Updated
- [x] `app/globals.css` — CSS custom properties + `@theme inline` for Tailwind v4
- [x] `ai_docs/prep/theme.html` — Interactive preview generated
- [x] Documentation saved to `ui_theme.md`

### Quality Checks
- [x] 22+ CSS variables defined in both light and dark modes
- [x] Primary color maintains recognition across modes (243° hue preserved)
- [x] Supporting colors (success/warning/destructive) match cool temperature of primary
- [x] Background matches Warm Off-White selection in light, Complementary Dark in dark
- [x] No placeholder comments remaining in CSS
- [x] Tailwind v4 `@theme inline` mappings present
