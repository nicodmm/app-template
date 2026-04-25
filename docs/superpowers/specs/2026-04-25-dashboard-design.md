# Dashboard del workspace — design spec

**Date:** 2026-04-25
**Status:** Spec inicial — pendiente brainstorm de definiciones antes de implementar
**Origen:** pedido del usuario al final del sprint del 2026-04-25

---

## Goal

Una vista resumen del estado del workspace, visible en `/app/dashboard` (hoy redirige a portfolio — reemplazar). Pensada para mostrar a futuro a stakeholders / nuevos usuarios cuando lleguen.

---

## Métricas pedidas (en orden de pedido)

| # | Métrica | Notas / Fuente |
|---|---|---|
| 1 | Cantidad de clientes | `count(accounts where workspace + activos)`. ¿Activos = no archivados? Hoy no hay flag de archivado — chequear. |
| 2 | Semáforo de clientes totalizado | Distribución `green/yellow/red/inactive` desde `accounts.health_signal`. Visual: barra apilada o donut. |
| 3 | Fee total | `sum(accounts.fee)`. MRR del portfolio. |
| 4 | Tiempo promedio de duración de cliente | Hoy solo tenemos `start_date` para cuentas activas — no hay churn flag. **DECISIÓN PENDIENTE**: ¿calculamos `now() - start_date` para activos (= antigüedad media), o necesitamos un campo `ended_at`/`churned_at`? Si es lo segundo, schema change. |
| 5 | Ticket medio | `avg(accounts.fee)`. |
| 6 | LTV | Necesita una definición. Opciones: (a) `ticket medio × duración media en meses`, simple pero asume churn=0; (b) traer churn rate desde otro lado, no lo tenemos. **DECISIÓN PENDIENTE**: definir fórmula o flag de feature. |
| 7 | Cantidad de clientes con posibilidad de up/cross/crecimiento | `count(distinct accountId)` con `signals.type in ("upsell_opportunity","growth_opportunity") AND status="active"`. |
| 8 | Tabla — clientes con más actividad + columna de fee | "Actividad" = ¿transcripciones procesadas en N días? ¿reuniones en N días? **DECISIÓN PENDIENTE**: definir métrica de actividad y ventana. |
| 9 | Industrias de clientes | Distribución por `accounts.industry`. Bar chart o lista con count. |
| 10 | Tamaños de clientes | Distribución por `accounts.employee_count`. Mismo patrón. |

---

## Drill-down (pedido en bloque)

Cada KPI/tile, al click o al "Ver más", abre un panel con desglose por:
- Unidad de negocio / servicios (cruzando con `accounts.service_scope`)
- Tipos de clientes (industria, tamaño)
- Usuarios a cargo (`accounts.owner_id`)

**DECISIÓN PENDIENTE**: ¿panel lateral (drawer)? ¿modal? ¿navegación a `/app/dashboard/<metric>`? Probablemente drawer reutilizando el patrón de paid-media-campaign-drawer (ya opaco, ya glass-tile-bg).

---

## Decisiones de diseño abiertas (resolver en brainstorm antes de codear)

1. **Qué es LTV con datos actuales** — fórmula explícita o postergar.
2. **Cómo se mide "duración de cliente"** sin churn flag.
3. **"Más actividad" = qué exactamente** — transcripciones / signals / cambios en paid media / combinación.
4. **Qué período por defecto cubre el dashboard** — ¿todo? ¿últimos 30/90 días? Aprovechar el `<DateRangePicker />` ya existente.
5. **UX del drill-down** — drawer vs modal vs ruta. Recomiendo drawer por consistencia con paid media.
6. **Permisos** — ¿el dashboard ve TODAS las cuentas del workspace o sólo las del miembro? El detalle de `members` ya filtra por owner cuando rol=member; replicar acá o mostrar vista global.
7. **¿Necesita schema change?** — probablemente al menos `accounts.archived_at` (o `status`) para distinguir clientes activos vs históricos. Sin esto las métricas hablan de "todos los registros que existen".

---

## Implementación sugerida (post-brainstorm)

Fases:

1. **Schema** — agregar `accounts.archived_at timestamp` (nullable). Migración + down. Filtrar todas las queries por `archived_at IS NULL` para "activos".
2. **Queries** — un único archivo `lib/queries/dashboard.ts` con funciones puras: `getWorkspaceDashboardSnapshot(workspaceId, period)` que devuelve todo lo que la página necesita. Probablemente paralelizar varias subqueries.
3. **Página** — `/app/dashboard/page.tsx`. Usa el `<GlassCard />` y `<DateRangePicker />` ya existentes. Grid de tiles. Charts con `recharts` (ya instalado).
4. **Drill-down drawer** — componente reutilizable `<DashboardMetricDrawer />` que recibe el id de métrica + período y dispara la query de breakdown correspondiente.
5. **Permisos** — heredar `viewerMember.role` y filtrar como hace el portfolio.
6. **Sidebar nav** — ya existe item "Dashboard" pero está oculto detrás de `role === admin/owner`. Decidir si lo abrimos a todos los miembros o queda admin.

Trigger.dev no necesita tocar nada: todo es read-side.

---

## Estructura sugerida de archivos

```
app/(protected)/dashboard/
  page.tsx              # reemplaza el redirect actual
  loading.tsx           # heredado de (protected)/loading.tsx, no hace falta uno propio

lib/queries/
  dashboard.ts          # snapshot + breakdowns

components/
  dashboard-snapshot.tsx       # client wrapper con period picker + state del drawer
  dashboard-kpi-tile.tsx       # presentational, recibe value + delta + onClick
  dashboard-health-distribution.tsx
  dashboard-industries-chart.tsx
  dashboard-sizes-chart.tsx
  dashboard-top-accounts-table.tsx
  dashboard-metric-drawer.tsx  # drill-down compartido
```

---

## No incluido en este pedido (para futuras iteraciones)

- Tendencias temporales (cómo evoluciona cada KPI mes a mes) — sería un dashboard "pro".
- Comparación entre miembros / equipos.
- Exportación a CSV.
- Alertas automáticas ("subió X%").

---

## Cómo arrancar la próxima sesión

Recomendación de primer prompt:

> "Voy a implementar el dashboard del spec en `docs/superpowers/specs/2026-04-25-dashboard-design.md`. Antes de codear quiero brainstormear las decisiones pendientes — empezá por las del LTV, duración de cliente, métrica de actividad, y permisos. Una pregunta a la vez."

Eso dispara la skill de `superpowers:brainstorming` que va a preguntar de a una hasta cerrar las decisiones, después escribir un plan, después ejecutar. Es el flujo limpio.
