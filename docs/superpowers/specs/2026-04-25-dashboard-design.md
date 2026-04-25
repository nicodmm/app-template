# Dashboard del workspace — design spec

**Date:** 2026-04-25
**Status:** Brainstorm cerrado — listo para implementation plan
**Origen:** pedido del usuario al final del sprint del 2026-04-25

---

## Goal

Una vista resumen del estado del workspace en `/app/dashboard` (hoy redirige a portfolio — se reemplaza). Pensada para mostrar a stakeholders / nuevos usuarios cuando lleguen, y para que cada miembro tenga un summary de su sub-portfolio.

---

## Decisiones cerradas

| # | Tema | Decisión |
|---|---|---|
| 1 | LTV | `ticket_medio × duración_media_en_meses`, asume churn=0 + tooltip aclaratorio. Upgrade futuro cuando haya histórico de churn. |
| 2 | Estado de cuenta | `accounts.closed_at timestamp NULL`. NULL = activo, fecha = cerrado. Toggle "Cerrar proyecto" en `EditAccountForm`. Sin enum de status (YAGNI) hasta que aparezca "pausado" como caso real. |
| 3 | Duración | Activos: `now() - start_date`. Cerrados: `closed_at - start_date`. Promedio ponderado entre los dos grupos. |
| 4 | Actividad | `count(transcripts) + count(context_documents)` por cuenta dentro del período del picker. Breakdown ("12 reuniones · 3 archivos") en tooltip. |
| 5 | Permisos | Reusa `canSeeAllAccounts(role)`. Owner/admin = workspace completo. Member = `accounts.owner_id = userId`. Item "Dashboard" del sidebar abierto a todos los roles. |
| 6 | Período | Default últimos 90 días. `<DateRangePicker />` configurable, mismo patrón de campañas/CRM. |
| 7 | Drill-down UX | Drawer único reusable `<DashboardMetricDrawer />`, mismo estilo glass que `paid-media-campaign-drawer.tsx`. |

---

## Métricas

Filtro base de TODAS las queries del dashboard:

```sql
WHERE accounts.workspace_id = $1
  AND accounts.closed_at IS NULL
  AND (viewer_role IN ('owner','admin') OR accounts.owner_id = $userId)
```

KPIs **snapshot puntual** (ignoran el período):
| KPI | Cálculo |
|---|---|
| Cantidad de clientes | `count(*)` |
| Distribución de salud | `group by health_signal` → `green/yellow/red/inactive` |
| Fee total | `sum(fee)` |
| Ticket medio | `avg(fee)` (excluye `fee IS NULL`) |
| Duración media (meses) | `avg(extract(epoch from coalesce(closed_at, now()) - start_date) / 2629800)` (excluye `start_date IS NULL`) |
| LTV | `ticket_medio × duración_media_meses`. Tooltip: "asume retención total". |
| Industrias | `group by industry`, count |
| Tamaños | `group by employee_count`, count |

KPIs **ventana** (usan el período del picker):
| KPI | Cálculo |
|---|---|
| Oportunidades up/cross | `count(distinct account_id)` con signals `type IN ('upsell_opportunity','growth_opportunity') AND status='active' AND created_at BETWEEN period` |
| Top actividad | top 10 por `count(transcripts) + count(context_documents)` con `created_at BETWEEN period` |

---

## Drill-down

Cada KPI tile, al click, abre `<DashboardMetricDrawer />` con tres secciones apiladas (no tabs):

1. **Por servicio** — agrupado por `accounts.service_scope`.
2. **Por industria + tamaño** — dos sub-listas (`industry` y `employee_count`).
3. **Por owner** — agrupado por `accounts.owner_id` con nombre/foto del usuario. **Omitido cuando `viewer.role === 'member'`** (verían sólo su propio nombre).

Cada sección muestra el valor agregado del KPI por grupo + cantidad de cuentas en ese grupo.

Server action: `getDashboardMetricBreakdown({ metric, workspaceId, viewer, period })`. Auth + scope replicado del snapshot.

---

## Estructura de archivos

```
app/(protected)/app/dashboard/
  page.tsx                       # Server component. requireUserId, member.role,
                                 # getWorkspaceDashboardSnapshot, render shell.

lib/queries/
  dashboard.ts                   # getWorkspaceDashboardSnapshot({ workspaceId, viewer, period })
                                 # getDashboardMetricBreakdown({ metric, workspaceId, viewer, period })

app/actions/
  dashboard-drawer.ts            # 'use server'. Wrapper auth+scope de getDashboardMetricBreakdown.

components/
  dashboard-snapshot.tsx         # Client. Recibe snapshot inicial + workspaceId.
                                 # DateRangePicker + estado del drawer + re-fetch al cambiar período.
  dashboard-kpi-tile.tsx         # Presentational. value, label, icon, tooltip?, onClick.
  dashboard-health-distribution.tsx
  dashboard-industries-chart.tsx
  dashboard-sizes-chart.tsx
  dashboard-top-accounts-table.tsx
  dashboard-metric-drawer.tsx    # Drawer reusable.
```

---

## Schema migration

```ts
// lib/drizzle/schema/accounts.ts
closedAt: timestamp("closed_at"),
```

```sql
-- drizzle/migrations/<n>_dashboard_closed_at/up.sql
ALTER TABLE accounts ADD COLUMN closed_at timestamp;
CREATE INDEX accounts_workspace_active_idx
  ON accounts (workspace_id) WHERE closed_at IS NULL;

-- drizzle/migrations/<n>_dashboard_closed_at/down.sql
DROP INDEX IF EXISTS accounts_workspace_active_idx;
ALTER TABLE accounts DROP COLUMN IF EXISTS closed_at;
```

Backfill: ninguno. Todas las cuentas existentes quedan con `closed_at = NULL` (= activas), comportamiento idéntico al actual hasta que alguien cierre una.

UI: toggle en `EditAccountForm` ("Cerrar proyecto" / "Reabrir"). Cuando setea, `closed_at = now()`. Cuando desmarca, `closed_at = NULL`. `AccountCard` muestra badge "Cerrado" + opacidad reducida (`opacity-60`).

`getPortfolioAccounts` y `getAccountById` agregan parámetro `includeClosed?: boolean` (default `false`). Las cuentas cerradas no aparecen en el portfolio por defecto. El detalle de cuenta sigue accesible vía URL directa para revisar histórico.

---

## Fases de implementación

1. **Schema + UI de cerrar** — migración `closed_at` + down + índice, toggle en `EditAccountForm`, indicador en `AccountCard`, ajuste de `getPortfolioAccounts`/`getAccountById`.
2. **Queries del dashboard** — `lib/queries/dashboard.ts` con snapshot + breakdowns. Subqueries paralelas con `Promise.all`. Tests con base local.
3. **Página + tiles + charts** — `app/(protected)/app/dashboard/page.tsx` (reemplaza el redirect actual), `<DashboardSnapshot />`, componentes presentational. Recharts (ya instalado).
4. **Drawer** — `<DashboardMetricDrawer />` + server action `getDashboardMetricBreakdown`. Conectar `onClick` de cada tile.
5. **Sidebar nav** — quitar el gate de role en el item "Dashboard".

Trigger.dev no necesita cambios: todo es read-side.

---

## Edge cases

- Workspace sin cuentas → empty state ("Aún no tenés clientes — creá tu primer cuenta").
- Cuenta sin `start_date` → excluida del cálculo de duración media. Sigue contando en `count` y `fee`.
- Cuenta sin `fee` → excluida de `avg(fee)` y `sum(fee)`. Si más del 25% de las cuentas activas no tienen fee, los tiles de fee/ticket/LTV muestran un hint ("X cuentas sin fee no incluidas").
- Member sin cuentas asignadas → empty state específico.
- Período fuera de rango (futuro / antes de la creación del workspace) → 0 actividad, normal.
- LTV con duración media = 0 → mostrar `—` en lugar de `$0`.

---

## Error handling

- Snapshot fetch falla → error boundary con botón "reintentar". La página entera no rompe.
- Breakdown fetch falla → error inline dentro del drawer, drawer queda abierto con "reintentar".
- Sin mutaciones desde el dashboard → no hay toasts.

---

## Testing

- Tests de queries en `lib/queries/dashboard.ts` con base local:
  - Snapshot completo (todos los KPIs).
  - Scope owner/admin vs member.
  - Filtro `closed_at IS NULL`.
  - Período fuera de rango.
- Verificación manual en browser del golden path (entrar al dashboard, cambiar período, abrir drawer, cambiar de rol y verificar scope) antes de cerrar la tarea.

---

## Fuera de scope (futuras iteraciones)

- Tendencias temporales (KPI mes a mes).
- Comparación entre miembros / equipos.
- Exportación a CSV.
- Alertas automáticas ("subió X%").
- Estado "pausado" además de `active`/`closed`.
- Deep-link al drawer vía URL (`?drawer=fee`).
- Vista dual admin (toggle "Vista workspace / Vista equipo").
