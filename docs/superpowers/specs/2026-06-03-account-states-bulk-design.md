# Estados de cuenta + selección múltiple + ajustes de finanzas/forms

**Fecha:** 2026-06-03
**Estado:** Aprobado (diseño)

## Objetivo

1. Estados de cuenta de 3 niveles (Activo / Inactivo / Finalizado) con archivado.
2. Selección múltiple en el portfolio para cambiar estado o eliminar en bloque.
3. Cambiar estado desde el interno de la cuenta.
4. Varios ajustes: selector de consultores con checks, fecha de finalización opcional al
   crear, retítulo de "Términos", limpieza del panel "A facturar" (sacar LTV, historial en
   ARS+USD) y proyección de facturación a 6 meses por cuenta.

## Decisiones tomadas

- 3 estados reales; Inactivo y Finalizado conviven en la pestaña **Archivadas** con un chip
  por card (Inactiva ámbar / Finalizada gris).
- Selección múltiple: **cambiar estado + eliminar** (eliminar con confirmación, irreversible).
- Permisos **igual que hoy** (`assertCanWriteAccount`): owner/admin sobre cualquiera; miembro
  solo sobre las cuentas de las que es responsable. Aplica por ítem en las acciones en bloque.

## Modelo de datos (Drizzle)

Migración que agrega DOS columnas nullable a `accounts` (con su `down.sql`; dev/prod comparten
Supabase, así que `db:migrate` cubre prod):

- `close_reason text` — `'inactive' | 'finished'` (null si activa). Distingue el sabor de
  archivado. `closed_at` sigue siendo el marcador de archivado (null = activa); toda la lógica
  actual (dashboard, portfolio, índice parcial `WHERE closed_at IS NULL`) queda intacta.
- `end_date date` — fecha de finalización del proyecto (opcional). Independiente de
  `closed_at`; se usa para acotar la proyección a 6 meses.

Estado derivado (helper `lib/accounts/status.ts`):
```ts
export type AccountStatus = "active" | "inactive" | "finished";
export function accountStatus(a: { closedAt: Date | null; closeReason: string | null }): AccountStatus {
  if (a.closedAt == null) return "active";
  return a.closeReason === "inactive" ? "inactive" : "finished";
}
export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Activo", inactive: "Inactivo", finished: "Finalizado",
};
```
*(No confundir con `healthSignal` red/yellow/green/inactive — es otra cosa y no se toca.)*

## Server actions (`app/actions/accounts.ts`)

- `setAccountStatus(accountId, status: AccountStatus)`:
  - `active` → `closedAt = null`, `closeReason = null`.
  - `inactive`/`finished` → `closedAt = now` (si no estaba), `closeReason = status`.
  - Usa `assertCanWriteAccount`. Revalida `/app/accounts/[id]`, `/app/portfolio`, `/app/dashboard`.
- `bulkSetAccountStatus(accountIds: string[], status: AccountStatus)`:
  - Valida permiso por cuenta; aplica a las permitidas. Devuelve `{ success, updated, denied }`.
- `bulkDeleteAccounts(accountIds: string[])`:
  - Valida permiso por cuenta; borra las permitidas. Devuelve `{ success, deleted, denied }`.
- Se reemplazan `closeAccount`/`reopenAccount` por `setAccountStatus` (y se actualizan sus
  llamadores). `deleteAccount` individual se conserva.
- `createAccount`/`updateAccount`: parsear `endDate` (date opcional) además de lo actual.

## Portfolio (`/app/portfolio`)

- Nuevo componente cliente `PortfolioGrid` que envuelve el grid y maneja el modo selección:
  - Botón **"Seleccionar"** (toggle). Con el modo activo, las cards muestran checkbox y el click
    selecciona en vez de navegar.
  - **Barra de acciones** (sticky abajo) cuando hay ≥1 seleccionada: contador, "Seleccionar
    todas", `Estado ▾` (Activo/Inactivo/Finalizado) → `bulkSetAccountStatus`, y **Eliminar**
    (confirm) → `bulkDeleteAccounts`. `router.refresh()` al terminar.
- `AccountCard` recibe props opcionales `selectable`, `selected`, `onToggle`. Sin esas props se
  comporta igual que hoy (Link). Con `selectable`, renderiza checkbox y el click togglea.
- En la pestaña **Archivadas**, cada card muestra chip **Inactiva** (ámbar) / **Finalizada**
  (gris) derivado de `closeReason`.
- `getPortfolioAccounts`/counts: sin cambios de filtro (active = closedAt null; archived =
  closedAt not null, ambos sabores). `AccountWithOwner` ya incluirá `closeReason`/`endDate` al
  estar en el schema.

## Interno de la cuenta (`/app/accounts/[accountId]`)

- Reemplazar `AccountStatusActions` (Archivar/Reabrir) por un **selector de estado**
  (Activo / Inactivo / Finalizado) → `setAccountStatus`. Componente `AccountStatusSelect`.
- `ArchivedAccountBanner` muestra el estado puntual (Inactiva / Finalizada).
- Retítulo del card de finanzas slim: "Términos de contratación" → **"Términos de contratación
  y pagos"**.

## Form de crear cuenta (`/app/accounts/new`) + editar

- **Consultores con checkboxes**: reemplazar el `<select multiple>` por una lista de checkboxes
  (`<input type="checkbox" name="consultantIds" value={userId}>`), patrón de
  `ServiceScopeCheckboxes`. Funciona sin JS (server form → `formData.getAll`).
- **Fecha de finalización**: debajo de "Fecha de inicio del proyecto", un checkbox
  "¿Tiene fecha de finalización?"; si se tilda, aparece un input `type="date"` (`name="endDate"`)
  igual que el de inicio. Componente cliente `EndDateField` (toggle + calendario controlado).
- Label "Términos de Contratación" → **"Términos de contratación y pagos"**.
- `EditAccountForm`: mismo `EndDateField` con `defaultValue=account.endDate`.

## Finanzas — panel "A facturar" (`components/finance/billing-list.tsx`)

- **Quitar** por completo el panel **"LTV por cuenta"** (incluye "Facturado + proyección
  estimada…", el empty state "Sin datos de LTV", la tabla y la nota al pie de la estimación).
  Se deja de usar `getLtvByAccount` desde esta vista (la query puede quedar o removerse si no la
  usa nadie más — se removerá si queda huérfana).
- **Historial facturado en ARS y USD**: hoy muestra solo ARS. `getBillingHistory` pasa a
  devolver por mes `{ year, month, totalArs, totalUsd }`:
  - `totalArs = sum(amount_ars)` (como hoy).
  - `totalUsd = sum( currencyOriginal === 'USD' ? amountOriginal : (fxRateUsed ? amountArs / fxRateUsed : 0) )`
    (aprox: filas en USD por su monto original; filas en ARS convertidas al TC de la fila).
  - El panel "Historial facturado" muestra ambas columnas (ARS y USD) por mes.

## Proyección a 6 meses por cuenta (`/app/finanzas/[accountId]`)

- Nuevo panel **"Proyección 6 meses"** debajo de "A facturar (esta cuenta)".
- Helper `lib/finance/projection.ts::projectAccountBilling(workspaceId, accountId, fromYear, fromMonth, months=6)`:
  - Para cada uno de los próximos 6 meses, suma los fees de los engagements activos de la cuenta
    cuyo período está activo ese mes (misma lógica que `runMonthlyBilling`/`computeHonorarios`),
    convertidos a ARS al TC del mes (o al más reciente si falta) y el total USD equivalente.
  - Si la cuenta tiene `endDate`, los meses posteriores a esa fecha proyectan 0.
  - Devuelve `Array<{ year, month, totalArs, totalUsd }>`.
- Render: tabla/sparkline simple con mes → ARS / USD, y total proyectado.

## Componentes / archivos afectados

**Nuevos:**
- `lib/accounts/status.ts` — helper de estado + labels.
- `lib/finance/projection.ts` — `projectAccountBilling`.
- `components/portfolio-grid.tsx` — grid cliente con modo selección + barra de acciones.
- `components/account-status-select.tsx` — selector de estado en el detalle.
- `components/end-date-field.tsx` — checkbox + calendario de fecha de finalización.
- `components/consultant-checkboxes.tsx` — checkboxes de consultores (o inline en el form).
- `components/finance/account-projection-panel.tsx` — panel de proyección 6 meses.
- Migración Drizzle `accounts` (+`close_reason`, +`end_date`) con `down.sql`.

**Modificados:**
- `lib/drizzle/schema/accounts.ts` — nuevas columnas.
- `app/actions/accounts.ts` — `setAccountStatus`, `bulkSetAccountStatus`, `bulkDeleteAccounts`,
  parse `endDate`; reemplazo de close/reopen.
- `lib/queries/accounts.ts` — sin cambio de filtro (las columnas viajan en `Account`).
- `lib/queries/finance.ts` — `getBillingHistory` con `totalUsd`; (posible remoción de
  `getLtvByAccount` si queda huérfana).
- `app/(protected)/app/portfolio/page.tsx` — usar `PortfolioGrid`.
- `components/account-card.tsx` — props de selección + chip de estado archivado.
- `app/(protected)/app/accounts/[accountId]/page.tsx` — `AccountStatusSelect`, título.
- `components/account-status-actions.tsx` — reemplazado por `AccountStatusSelect` (o adaptado).
- `components/archived-account-banner.tsx` — texto según estado.
- `app/(protected)/app/accounts/new/page.tsx` — checkboxes consultores + `EndDateField` + label.
- `components/edit-account-form.tsx` — `EndDateField`.
- `components/finance/billing-list.tsx` — quitar LTV; historial ARS+USD.
- `app/(protected)/app/finanzas/[accountId]/page.tsx` — panel de proyección.

## Testing / verificación

- `npm run db:generate` + crear `down.sql` + `npm run db:migrate`.
- `npm run type-check` y `npm run build`.
- Manual: cambiar estado individual y en bloque; eliminar en bloque (confirm + permisos);
  archivadas con chips correctos; crear cuenta con consultores tildados + fecha de finalización;
  "A facturar" sin LTV; historial con ARS y USD; proyección 6 meses respeta endDate.

## Fuera de alcance

- Automatizar el pase a "Finalizado" cuando se alcanza `endDate` (solo se guarda la fecha).
- Vistas públicas/demo.
