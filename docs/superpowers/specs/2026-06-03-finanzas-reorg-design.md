# Reorganización del módulo de Finanzas

**Fecha:** 2026-06-03
**Estado:** Aprobado (diseño)
**Spec previo relacionado:** `2026-06-02-modulo-finanzas-design.md`

## Contexto y objetivo

El módulo de Finanzas hoy vive en dos lugares: una pantalla propia `/app/finanzas`
(tabs A facturar / TC-IPC / Honorarios, solo finance-admin) y un bloque pesado
`FinanceSection` embebido en el detalle de cada cuenta (`/app/accounts/[accountId]`)
con datos de facturación, equipo consultor, editor de términos y documentos.

El admin tiene que cargar manualmente lo que se factura cada mes (escribir términos →
estructurar con IA → "Generar mes"), y la información financiera está mezclada con la
operación de la cuenta.

**Objetivo:** sacar la operación financiera del interno de la cuenta y concentrarla en
`/app/finanzas`, dejando en la cuenta solo un campo de texto de términos y los
consultores. Que la facturación de cada cuenta aparezca **automáticamente** mes a mes
(con edición), tomando el "Fee mensual (USD)" de la cuenta como base + los extras
descritos en los términos.

## Decisiones tomadas

1. **Se mantiene** el motor de engagements/períodos/shares (no se reemplaza).
2. **Se mantienen** los honorarios variables (fee shares).
3. El detalle financiero por cuenta es una **ruta dedicada** `/app/finanzas/[accountId]`.
4. Consultores y términos se cargan al **crear** la cuenta y también se pueden **editar
   después**.
5. Los *fee shares* del servicio base se enganchan al **engagement base automático** (el
   LLM los referencia por nombre de neurona/consultor).
6. El campo de Términos y los consultores en el interno de la cuenta quedan **gateados a
   finance-admin / owner / admin** (misma visibilidad que la sección de finanzas actual).

## Arquitectura

### 1. Engagement base automático (fee de la cuenta)

Hoy `account.fee` (USD) es solo informativo; la facturación sale de engagements que el
LLM estructura. Cambia a:

- Al crear una cuenta con `fee`, se siembra **un** engagement con:
  - `source = "account_fee"` (nuevo valor de `source`, distinto de `manual`/`llm`)
  - `neurona = "Fee mensual"` (etiqueta base)
  - `currency = "USD"`, `billingRule = "mep"`
  - `startDate = account.startDate ?? primer día del mes actual`, `endDate = null`
  - un único período abierto (`fromDate = startDate`, `toDate = null`, `fee = account.fee`,
    `source = "account_fee"`)
- **Sincronización**: en `updateAccount`, si cambia `fee` o `startDate`, se actualiza el
  período base (fee) y el engagement/período base (fromDate). Si el `fee` pasa a vacío, el
  engagement base se marca `status = "ended"` (no se borra, para preservar historial).
- El engagement base **nunca** es borrado por la task de estructuración (que solo borra
  `source = "llm"`).
- Helper puro/reutilizable en `lib/finance/base-engagement.ts`:
  `ensureBaseEngagement(accountId, workspaceId, { fee, startDate })` — idempotente
  (crea si no existe, sincroniza si existe).

**Identificación:** se usa `source = "account_fee"` como marcador; hay a lo sumo uno por
cuenta.

### 2. Reframe de la estructuración por IA

`structure-finance-terms` (task) y el prompt (`lib/ai/finance-terms-prompt.ts`) cambian
para que el LLM **no re-emita el fee recurrente base**. Solo produce:

- **Engagements extra**: cargos temporales/one-off (ej. "Implementación CRM"), add-ons,
  cambios de fee a futuro, descuentos (como períodos/engagements separados). `source = "llm"`.
- **Fee shares** (honorarios variables). Cada share referencia un consultor y, opcionalmente,
  a qué servicio aplica:
  - Si el share aplica al **servicio base** (sin engagement extra propio), la task lo
    engancha al **engagement base** (`source = "account_fee"`) de la cuenta.
  - Si aplica a un engagement extra, se engancha a ese.

Cambios concretos en la task:
- Sigue borrando e insertando engagements `source = "llm"` (no toca `account_fee`).
- Al resolver shares, primero ubica el engagement destino: por match de neurona contra los
  engagements LLM recién insertados; si no matchea ninguno y existe engagement base, lo
  engancha al base.
- El prompt recibe contexto explícito: "el fee mensual base ya está cargado en USD
  {baseFee}; NO lo incluyas como engagement; estructurá solo extras/cambios/descuentos y los
  repartos a consultores".

Esto evita el doble conteo del fee base y resuelve el ejemplo:
`fee 1500` (base) + `"+XXX por CRM meses 1-3"` (engagement extra LLM) → la suma del mes la
hace `generateBillingForMonth`.

### 3. Generación automática del "A facturar"

- **En cada carga** de la vista A facturar para el mes seleccionado: se ejecuta la
  generación (upsert idempotente) **antes** de leer las filas. `generateBillingForMonth` ya
  preserva `status`/`billedAt`/`paidAt`. Se extrae el núcleo a una función reutilizable
  `runMonthlyBilling(workspaceId, year, month)` invocable desde el server component, el
  server action y la task de cron.
- **Cron mensual** Trigger.dev (`generate-monthly-billing`): el día 1 de cada mes corre
  `runMonthlyBilling` para cada workspace con engagements activos. Requiere `npx
  trigger.dev deploy` (ver `feedback_trigger_dev_redeploy`).
- Se conservan los botones manuales **"Regenerar"** (force refresh) y **"Agregar cargo"**.
  Los cargos manuales siguen siendo `isAdditional = true`.

### 4. Interno de la cuenta (`/app/accounts/[accountId]`)

- **Se elimina** el render de `<FinanceSection>`.
- **Se agrega** (solo para finance-admin/owner/admin):
  - **Consultores** mostrados junto al **Responsable** en el header, con agregar/quitar
    inline (reutiliza la lógica de `addAccountConsultant`/`removeAccountConsultant`).
  - **Términos de Contratación**: un único `<textarea>` editable (campo `termsRawText`).
    Al guardar, dispara re-estructuración automática (`structureTerms`). Sin el editor de
    engagements/períodos/shares (eso queda en `/app/finanzas/[accountId]`).
- Componentes `finance-section.tsx`, `finance-billing-form.tsx`, `finance-team.tsx`,
  `terms-editor.tsx`, `finance-docs.tsx`, `term-dialogs.tsx` se **mueven/reusan** desde
  `/app/finanzas/[accountId]` (no se borran; se relocaliza su uso).

### 5. Creación de cuenta (`/app/accounts/new` + `createAccount`)

Form:
- **Términos de Contratación**: `<textarea name="terms">` debajo de "Objetivos de la cuenta".
- **Consultores**: selector múltiple (`name="consultantIds"`) al lado de "Responsable".

`createAccount` (server action):
1. Inserta `accounts` (como hoy).
2. Inserta fila `account_finance` con `termsRawText` = términos (si hay).
3. Inserta filas `account_consultants` para los consultores elegidos.
4. `ensureBaseEngagement(...)` con el fee.
5. Si hay términos, dispara `structure-finance-terms`.
6. Dispara enriquecimiento (si hay web), sync de usage, redirect (como hoy).

### 6. Pantalla Finanzas (`/app/finanzas`)

Tabs: **Cuentas** (default) · A facturar · TC / IPC · Honorarios.

- **Cuentas** (nuevo): grid de cards financieras. Por cuenta:
  - nombre, responsable, fee mensual,
  - **alertas de estado**: `Falta NDA`, `Faltan datos de facturación`
    (sin `razonSocial`/`cuit`), `Términos sin estructurar` (`termsStatus != "ready"` con
    texto cargado),
  - link a `/app/finanzas/[accountId]`.
  - Nueva query `listFinanceAccountCards(workspaceId)` que devuelve, por cuenta:
    nombre, ownerName, fee, hasNda, hasBillingData, termsStatus.
- **A facturar / TC-IPC / Honorarios**: igual que hoy (consolidado), con la auto-generación
  de la sección 3.

### 7. Detalle financiero por cuenta (`/app/finanzas/[accountId]`)

Server component gateado a finance-admin/owner/admin (patrón `requireFinanceAccount`).
Orden:
1. Header: nombre de la cuenta, back a `/app/finanzas`, responsable, consultores.
2. **Documentos** (`FinanceDocs`).
3. **Términos** (`TermsEditor` completo: texto + estructurar + engagements/períodos/shares).
4. **Datos de facturación y legales** (`FinanceBillingForm`).
5. **Equipo consultor** (`FinanceTeam`).
6. **A facturar (esta cuenta)**: filas del mes para esta cuenta, editable + agregar cargo
   (vista de `BillingList` filtrada por `accountId`, o un subcomponente reutilizado).

## Cambios de esquema (Drizzle)

Sin columnas nuevas estrictamente necesarias: `finance_engagements.source` y
`finance_engagement_periods.source` ya son `text` libres, así que `"account_fee"` entra sin
migración de tipo. **No se requiere migración de DDL.** (Si en revisión se prefiere un flag
booleano `is_base` para claridad, se agregaría con su `down.sql` siguiendo el workflow de
CLAUDE.md; por ahora se evita.)

## Flujo de datos (resumen)

```
Crear cuenta (fee 1500, términos "+XXX CRM meses 1-3", consultor X 20%)
  → accounts + account_finance(termsRawText) + account_consultants
  → ensureBaseEngagement → engagement base (account_fee, 1500/mes, MEP)
  → structure-finance-terms (LLM):
       borra engagements llm previos
       inserta engagement "CRM" (llm, períodos meses 1-3, XXX)
       share consultor X 20% → engancha al engagement base (account_fee)
  → aparece en /app/finanzas (tab Cuentas) con alertas
Ver /app/finanzas (tab A facturar, mes actual)
  → runMonthlyBilling(ws, y, m) upsert:
       base 1500→ARS(MEP), CRM XXX→ARS si mes ∈ 1-3
  → BillingList editable
Honorarios mes
  → computeHonorarios: fijo (member_compensation) + variable (share 20% de 1500)
Cron día 1 → runMonthlyBilling para todos los workspaces
```

## Componentes / archivos afectados

**Nuevos:**
- `lib/finance/base-engagement.ts` — `ensureBaseEngagement`
- `lib/finance/run-monthly-billing.ts` (o función exportada desde queries) — núcleo de generación
- `app/(protected)/app/finanzas/[accountId]/page.tsx` — detalle por cuenta
- `components/finance/finance-account-card.tsx` — card con alertas
- `components/finance/finance-accounts-grid.tsx` — grid (tab Cuentas)
- `components/account-detail/account-consultants-inline.tsx` — consultores junto al responsable
- `components/account-detail/account-terms-field.tsx` — textarea de términos en la cuenta
- `trigger/tasks/generate-monthly-billing.ts` — cron mensual
- `lib/queries/finance.ts` → `listFinanceAccountCards(workspaceId)`

**Modificados:**
- `app/(protected)/app/accounts/[accountId]/page.tsx` — quita `FinanceSection`, agrega consultores+términos
- `app/(protected)/app/accounts/new/page.tsx` — términos + consultores
- `app/actions/accounts.ts` — `createAccount` (términos, consultores, base engagement); `updateAccount` (sync base engagement)
- `components/finance/finanzas-tabs.tsx` — agrega tab "Cuentas"
- `app/(protected)/app/finanzas/page.tsx` — auto-generación + datos de cards
- `app/actions/finance.ts` — extraer `runMonthlyBilling`; `createAccount` consultor helper si aplica
- `trigger/tasks/structure-finance-terms.ts` — no re-emitir base, shares al engagement base
- `lib/ai/finance-terms-prompt.ts` — prompt reframe

**Reubicados (mismo componente, nuevo lugar de uso):**
- `FinanceBillingForm`, `FinanceTeam`, `TermsEditor`, `FinanceDocs`, `term-dialogs` → usados en `/app/finanzas/[accountId]`.

## Permisos

- `/app/finanzas` y `/app/finanzas/[accountId]`: finance-admin / owner / admin (igual que hoy).
- Consultores + Términos en el interno de la cuenta: mismos roles.
- Server actions de finanzas: siguen usando `requireFinanceWorkspace` / `requireFinanceAccount`.

## Testing / verificación

- Crear cuenta con fee y términos con extra temporal → aparece engagement base + extra; A
  facturar suma correctamente en los meses correspondientes.
- Editar fee → período base se actualiza; A facturar refleja el cambio (estados preservados).
- Re-estructurar términos no duplica el fee base ni borra el engagement base.
- Honorario variable de un consultor sobre el base = % del fee base.
- Card de cuenta nueva muestra alertas correctas (NDA, datos facturación, términos).
- Cron `generate-monthly-billing` corre idempotente.
- `npm run type-check`, `npm run lint`, `npm run build`.

## Fuera de alcance

- Vistas públicas/demo (`/demo/...`).
- Migración de DDL (no requerida).
- Cambios en TC/IPC y honorarios fijos (se mantienen).
