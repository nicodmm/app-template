# Mobile bottom tab bar

**Date:** 2026-04-26

## Goal

The protected app sidebar is `hidden md:flex` — on mobile, users have no nav. Add a fixed bottom tab bar with the same 3 primary items (Dashboard, Portfolio, Perfil) so mobile users can navigate between the main surfaces.

## Scope

- New client component `<MobileTabBar />` with 3 hard-coded tabs matching the sidebar's `navItems`.
- Render it in `app/(protected)/layout.tsx` below `<main>`, outside the existing flex row.
- Pad the `<main>` element with `pb-16` on mobile so the tab bar doesn't cover content. Reset to `pb-0` on `md:`.
- `md:hidden` on the tab bar so it disappears when the sidebar appears.

## Layout

```
<div h-dvh flex col>
  <AppHeader />                      ← already there
  <div flex-1 flex>
    <Sidebar hidden md:flex />        ← already there
    <main flex-1 overflow-auto pb-16 md:pb-0>
      {children}
    </main>
  </div>
  <MobileTabBar md:hidden />          ← NEW (fixed bottom)
</div>
```

The tab bar is `fixed inset-x-0 bottom-0 z-30 md:hidden` so it overlays the main scroll area and stays put while content scrolls underneath.

## Tab definition

Same items as `sidebar.tsx`:

| Label | href | Icon |
|---|---|---|
| Dashboard | `/app/dashboard` | `BarChart2` |
| Portfolio | `/app/portfolio` | `LayoutGrid` |
| Perfil | `/app/profile` | `User` |

Active state: `pathname === href || pathname.startsWith(`${href}/`)` — same predicate as sidebar.

## Visual

- Glass tile background (`backdrop-blur-[18px]`, `[background:var(--glass-bg)]`, `[border-top:1px_solid_var(--glass-border)]`).
- Each tab is a flex column: 24×24 icon on top, label below in `text-[10px]`.
- Active tab: icon and label tinted `text-primary`; small dot indicator above the icon (`h-1 w-1 rounded-full bg-primary`).
- Inactive tab: `text-muted-foreground`, no dot.
- Tap target: full tab height + horizontal flex-1 for thumb-friendly hit area.

## Accessibility

- `<nav aria-label="Navegación principal">` wrapper.
- Each `<Link>` gets `aria-current="page"` when active.
- Tap targets ≥ 44×44 px (iOS HIG minimum).

## Out of scope

- Admin items (`/admin/users`) — desktop-only.
- Usage box (transcripts / mes, plan) — desktop-only sidebar.
- Hamburger drawer / secondary sheet — not needed with only 3 items.
- Tablet breakpoint nuance — `md:` (768px) is the cutover. Below that → tab bar; above → sidebar.

## Files

| Path | Action |
|---|---|
| `components/mobile-tab-bar.tsx` | Create |
| `app/(protected)/layout.tsx` | Modify (mount the tab bar, pad main) |

## Verification

- `npm run type-check` clean
- Manual: open the app on a 375px viewport. Tab bar appears at the bottom; content scrolls without being hidden behind it; active tab visually distinct; tapping each tab navigates correctly. At 768px+ the bar disappears and sidebar takes over.
