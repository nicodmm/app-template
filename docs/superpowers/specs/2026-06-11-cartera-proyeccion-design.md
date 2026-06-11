# Cartera & Proyección Dinámica — Diseño

**Fecha:** 2026-06-11
**Módulo:** Finanzas (`/app/finanzas`)
**Gate:** `finance_admin` (igual que el resto de finanzas)
**Referencia visual:** `REF/delenio-cartera.html`

## 1. Objetivo

Agregar a Finanzas un dashboard de **cartera de clientes + proyección de MRR**
inspirado en `REF/delenio-cartera.html`, pero con la cartera **auto-poblada desde
las cuentas reales** (módulo Cuentas / finanzas) en lugar del seed/paste manual del
reference.

Es una **herramienta de decisión**: muestra el MRR de hoy, proyecta su evolución
contra un breakeven, y deja simular escenarios (clientes nuevos, churn, bajas)
**sin modificar los datos de producción**.

## 2. Decisiones tomadas (brainstorm)

1. **Filas:** 1 fila por cuenta. El ticket es la suma de los fees USD de sus
   engagements activos este mes; la neurona mostrada es la del engagement de mayor fee.
2. **Edición:** solo escenario *what-if* local. Editar celdas recalcula la proyección
   pero **nunca** escribe en las cuentas. Botón "↺ Restaurar desde cuentas" para
   volver a los datos reales.
3. **Moneda:** toggle **USD / ARS**. USD es nativo (los fees están en USD); ARS
   convierte el MRR de cada mes por el MEP del mes (e IPC para proyectar a futuro).
4. **Supuestos:** persistidos por workspace en una tabla nueva
   `finance_projection_assumptions`.

5. **Estilo:** adaptado al sistema de diseño de la app (shadcn/Tailwind, tema actual
   de finanzas), conservando los elementos clave del reference: cards de KPI, chart
   con acento dorado y tabla editable. Sin inline styles (regla de CLAUDE.md).

## 3. Ubicación e integración

- Nueva pestaña **"Proyección"** (5ª) en `components/finance/finanzas-tabs.tsx`,
  después de "Honorarios".
- Renderiza un nuevo client component `CarteraProyeccion`.
- Los datos se traen en el server page (`app/(protected)/app/finanzas/page.tsx`) y
  se pasan como props, igual que las otras pestañas.
- Soportar `?tab=proyeccion` en `initialTab`.

## 4. Modelo de datos

### 4.1 Nueva tabla `finance_projection_assumptions` (1 fila por workspace)

`lib/drizzle/schema/finance_projection_assumptions.ts`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK defaultRandom | |
| `workspaceId` | uuid notNull **unique** | 1:1 con workspace |
| `breakevenUsd` | numeric(14,2) notNull default 0 | breakeven mensual USD |
| `otrosIngresosUsd` | numeric(14,2) notNull default 0 | ingresos recurrentes no-cartera |
| `clientesNuevosMes` | integer notNull default 0 | altas estimadas / mes |
| `ticketMedioNuevoUsd` | numeric(14,2) notNull default 0 | ticket medio de altas |
| `churnUsdMes` | numeric(14,2) notNull default 0 | churn adicional USD / mes |
| `horizonteMeses` | integer notNull default 6 | 6 (H2) o 18 (a dic-27) |
| `updatedByUserId` | uuid | quién editó |
| `updatedAt` | timestamp defaultNow | |

- Migración generada con `db:generate:custom` o `db:generate` + **`down.sql`**
  (drop table) **antes** de `db:migrate`.
- Registrar la tabla en `lib/drizzle/schema/index.ts`.

### 4.2 Sin cambios de schema adicionales

La cartera se deriva de tablas existentes: `accounts`, `finance_engagements`,
`finance_engagement_periods`, `fx_rates`.

## 5. Capa de queries / acciones

`lib/queries/finance.ts` (o un archivo nuevo `lib/queries/projection.ts`):

### 5.1 `getPortfolioForProjection(workspaceId): PortfolioRow[]`

Devuelve una fila por cuenta **no cerrada** (`accounts.closedAt IS NULL`):

```ts
interface PortfolioRow {
  accountId: string;
  name: string;            // accounts.name
  neurona: string;         // neurona del engagement de mayor fee USD; "Otro" si no hay
  ticketUsd: number;       // suma de fees USD de engagements activos este mes
  estado: "Activo" | "En riesgo" | "Se va";
  bajaMonth: string | null;// "YYYY-MM" desde accounts.endDate, o null
}
```

Lógica:
- Tomar las cuentas activas del workspace + sus `finance_engagements` activos +
  el `finance_engagement_periods` activo para el mes corriente (`isActiveInMonth`).
- `ticketUsd` por engagement: si `currency === "USD"` → `fee`; si `"ARS"` →
  `fee / mepActual` (MEP del mes corriente; si no hay MEP, 0 y se loguea). Sumar
  por cuenta.
- `neurona`: la del engagement con mayor fee USD de esa cuenta.
- `estado`:
  - `endDate` presente y futuro (>= mes corriente) → `"Se va"`
  - si no, `healthSignal === "red"` → `"En riesgo"`
  - si no → `"Activo"`
- `bajaMonth`: `accounts.endDate` formateado `YYYY-MM`, o null.

### 5.2 `getProjectionAssumptions(workspaceId): Assumptions`

Lee la fila de `finance_projection_assumptions`; si no existe devuelve defaults
(todos en 0, horizonte 6).

### 5.3 Server action `upsertProjectionAssumptions(input)`

`app/actions/finance.ts`. `"use server"`, `requireUserId()` + check `isFinanceAdmin()`.
Upsert por `workspaceId` (onConflict update). Devuelve `{ success, error? }`.
`revalidatePath("/app/finanzas")`.

## 6. Componente cliente `CarteraProyeccion`

`components/finance/cartera-proyeccion.tsx` (`"use client"`).

Props: `{ portfolio: PortfolioRow[]; assumptions: Assumptions; fx: FxProjection; }`
donde `FxProjection` lleva los MEP/IPC conocidos por mes + el MEP más reciente,
para la conversión a ARS (ver §7.2).

Estado local:
- `rows: PortfolioRow[]` — inicializado con `portfolio` (editable what-if).
- `a: Assumptions` — supuestos editables.
- `horizon: 6 | 18`, `currency: "USD" | "ARS"`.

### 6.1 Sección ① Supuestos
Inputs para breakeven, otros ingresos, clientes nuevos/mes, ticket medio nuevo,
churn, y toggle de horizonte. Botón **"Guardar"** (o autosave con debounce) que
llama a `upsertProjectionAssumptions`. Recalcula en vivo al editar.

### 6.2 Sección ② Resultado
- **Cards KPI:** MRR hoy, clientes activos, ticket medio, gap a breakeven hoy,
  cruza breakeven (primer mes ≥ BE), MRR fin de horizonte (+ EBITDA/mes).
- **Chart de proyección:** componente React que genera el SVG (portado de
  `drawProj` del reference): área dorada del MRR, línea punteada del breakeven,
  puntos verde/rojo según ≥/< breakeven, labels de meses.
- **Toggle USD/ARS** afecta cards y chart.

### 6.3 Sección ③ Cartera de clientes
Tabla editable (what-if): Cliente · Neurona · Ticket USD/mes · Estado · Mes de baja.
- Inputs/selects controlados sobre `rows`; cada cambio recalcula la proyección.
- Footer: "N clientes · MRR cartera $X".
- Botones: **"+ Agregar cliente"** (fila vacía local) y
  **"↺ Restaurar desde cuentas"** (resetea `rows` a `portfolio`).
- Se elimina la sección 04 del reference (pegar desde planilla / JSON), porque la
  fuente ahora son las cuentas.

## 7. Matemática de proyección (portada a TS)

`lib/finance/projection-model.ts` — funciones puras, testeables.

### 7.1 Lista de meses
Generada dinámicamente desde el mes corriente. `horizonte 6` = 6 meses;
`18` = hasta dic-2027. (El reference arranca en Jun-26, que coincide con hoy.)

### 7.2 Núcleo (portado de `compute()` / `activeAt()` del reference)

```
baseActiveAt(mi)  = Σ rows[].ticketUsd  para filas presentes en el mes índice mi
                    (presente si bajaMonth es null o mi <= índice(bajaMonth))
mrrNowUsd         = baseActiveAt(0) + otrosIngresosUsd
ticketMedioUsd    = baseActiveAt(0) / nClientes
para mi en 1..horizonte:
  mrrUsd(mi) = otrosIngresosUsd + baseActiveAt(mi) + (nuevos*ticketNuevo - churn)*mi
cruza         = primer mi con mrrUsd(mi) >= breakeven
```

### 7.3 Conversión a ARS (toggle ARS)
`mrrArs(mes) = mrrUsd(mes) * mepProyectado(mes)`, donde:
- mes con MEP conocido (`fx_rates`) → ese MEP.
- mes futuro sin dato → `mepMásReciente * Π(IPC de los meses entre el último
  conocido y el target)`. Esto honra "MEP del mes + IPC para proyección" sin
  enredar el compounding por engagement; se documenta como simplificación del
  modelo what-if. El breakeven en ARS usa el MEP del mes corriente.

## 8. Archivos a crear / tocar

**Crear:**
- `lib/drizzle/schema/finance_projection_assumptions.ts`
- `drizzle/migrations/<n>_*/` (+ `down.sql`)
- `lib/queries/projection.ts` (o agregar a `lib/queries/finance.ts`)
- `lib/finance/projection-model.ts` (math pura + tests)
- `components/finance/cartera-proyeccion.tsx`
- `components/finance/proyeccion-chart.tsx` (SVG)

**Tocar:**
- `lib/drizzle/schema/index.ts` (export de la tabla nueva)
- `app/actions/finance.ts` (`upsertProjectionAssumptions`)
- `app/(protected)/app/finanzas/page.tsx` (fetch portfolio + assumptions + fx, pasar props)
- `components/finance/finanzas-tabs.tsx` (pestaña "Proyección", tipo `TabId`, prop nueva)

## 9. Testing / verificación

- Unit tests de `projection-model.ts`: `baseActiveAt` con bajas, cruce de breakeven,
  conversión ARS con MEP/IPC proyectado.
- `npm run type-check` + `npm run build` como compuerta (no `lint`).
- Verificación manual: pestaña carga con cuentas reales, editar supuestos persiste,
  toggle USD/ARS, restaurar desde cuentas.

## 10. Fuera de alcance (YAGNI)

- Importar/pegar desde planilla y export/import JSON (la fuente son las cuentas).
- Escribir cambios de la tabla what-if a las cuentas.
- Compounding IPC por engagement dentro del what-if (se usa MEP proyectado del MRR).
- Histórico de escenarios guardados.
