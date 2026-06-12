# Portfolio: filtro "Mis cuentas" (#6)

**Fecha:** 2026-06-12
**Estado:** Diseño aprobado, pendiente de plan
**Feature:** #6 del batch de mejoras — toggle "Todas / Mis cuentas" en el portfolio para owner/admin.

## Problema

Hoy el portfolio (`/app/portfolio`) muestra:
- **Owner/Admin** (elevados): **todas** las cuentas del workspace. Cuando hay muchas, es abrumador.
- **Members**: solo las cuentas donde son **dueños** (`accounts.ownerId === userId`).

Se quiere que owner/admin puedan filtrar a una **vista simplificada de "sus" cuentas**, sin perder la opción de ver todas.

## Decisiones de producto (confirmadas)

1. **"Mi cuenta" = dueño O consultor.** Una cuenta es "mía" si `accounts.ownerId === userId` **o** existe una fila en `account_consultants` para `(accountId, userId)`.
2. **Default para admin = "Todas".** Se mantiene el comportamiento actual; "Mis cuentas" es opt-in vía el toggle.
3. **El toggle es solo para owner/admin.** Los members no lo ven y mantienen su visibilidad actual (solo dueño). No se tocan permisos de members.

## Diseño

### Queries (`lib/queries/accounts.ts`)

`PortfolioScope` gana un campo opcional `onlyMine?: boolean`.

La función de condiciones de scope pasa a:
- Si el rol NO es elevado (member): empuja `eq(accounts.ownerId, userId)` (comportamiento actual, sin cambios).
- Si el rol es elevado y `onlyMine` es true: empuja
  `or(eq(accounts.ownerId, userId), exists(<subquery account_consultants>))`,
  donde la subquery es
  `exists(db.select({ one: sql\`1\` }).from(accountConsultants).where(and(eq(accountConsultants.accountId, accounts.id), eq(accountConsultants.userId, scope.userId))))`.
- Si el rol es elevado y `onlyMine` es false/undefined: sin condición extra (ve todas — actual).

Tanto `getPortfolioAccounts` como `getPortfolioAccountCounts` usan esta misma función, así que los contadores de las pestañas Activas/Archivadas reflejan el filtro `onlyMine`.

Import nuevo en el archivo: `or`, `exists` de `drizzle-orm`, y `accountConsultants` del schema.

### Página (`app/(protected)/app/portfolio/page.tsx`)

- `searchParams` se extiende a `{ status?: string; mine?: string }`.
- `const onlyMine = isElevated && params.mine === "1";` (solo aplica para elevados; un member que ponga `?mine=1` a mano no cambia nada — su scope ya es owner-only).
- Se pasa `onlyMine` a `getPortfolioAccounts` y `getPortfolioAccountCounts`.
- Se renderiza el toggle solo si `isElevated`, pasándole el `status` actual (para preservarlo en los links) y el valor `mine` actual.

### Componente (`components/portfolio-scope-toggle.tsx`)

Nuevo client component. Control segmentado de dos opciones ("Todas" / "Mis cuentas"), estilo consistente con `PortfolioStatusTabs`. Cada opción es un `Link` (o navegación con `useRouter`) a `/app/portfolio?status=<status>&mine=<0|1>` preservando el `status`. Marca visualmente la opción activa según `mine`. Accesible (aria-pressed / aria-current en la opción activa).

## Fuera de alcance

- Visibilidad de members (sin cambios) y `getAccountById` (acceso por cuenta individual, sin cambios).
- Persistencia de la preferencia entre sesiones (es por URL param). Se podría agregar luego con una cookie si se pide.
- No hay cambios de schema ni migración.

## Criterio de aceptación

- Owner/Admin ven un toggle "Todas / Mis cuentas" en el portfolio; default "Todas" (ven todo, como hoy).
- Con "Mis cuentas" activo, ven solo cuentas donde son dueños o consultores; los contadores de Activas/Archivadas reflejan ese filtro; el `status` se preserva al alternar.
- Members no ven el toggle y su listado sigue igual (solo cuentas propias).
- `npm run type-check` y `npm run build` en verde.
