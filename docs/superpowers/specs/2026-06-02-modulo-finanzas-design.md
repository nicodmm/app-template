# Módulo de Finanzas — Diseño

**Fecha:** 2026-06-02
**Estado:** Diseño aprobado pendiente de plan de implementación
**Referencias:** `REF/Screenshot 2026-06-02 2308–2311*.png` (columnas del Airtable de administración).

## 1. Resumen

Nueva pantalla **`/app/finanzas`** (al nivel de dashboard/portfolio) que, a partir del portafolio (accounts = clientes) y de condiciones cargadas en lenguaje natural, resuelve dos cosas:

1. **Montos a facturar por cliente** — qué/cuánto/a quién facturar cada mes, con conversión de moneda (USD→ARS por MEP o MEP+IPC), estado (Pendiente/Facturado/Cobrado), histórico mensual y proyección/LTV.
2. **Honorarios a devengar por consultor** — fijo recurrente por persona + variable por proyecto/neurona (Growth 20% del fee, Marketing fee fijo por consultor, Fee Project Leader, etc.).

El mecanismo central: el consultor **explica en lenguaje natural** las condiciones de la propuesta y el reparto de honorarios; un **LLM lo tabula** en una estructura editable. Las dos vistas (facturar / honorarios) leen de esa estructura, nunca del texto. Datos administrativos/legales (CUIT, razón social, IVA, representante legal) se **extraen del NDA con LLM** y el admin los confirma.

### Decisiones de diseño (brainstorming)
- **Alcance:** un solo spec; el plan de implementación se organiza en fases.
- **LLM:** borrador editable + texto NL guardado. El cálculo usa la estructura editada, no el texto.
- **Honorarios:** fijo recurrente (un monto por persona, carga manual del admin) **+** variable por proyecto/neurona.
- **Moneda:** multimoneda. Fee normalmente en USD; facturación normalmente en ARS. Regla de conversión por engagement: `misma` | `MEP` | `MEP+IPC`. Algunos casos se facturan directo en USD.
- **TC/IPC:** carga manual mensual por admin, con histórico (`fx_rates`).
- **NDA:** LLM extrae + admin confirma.
- **Permisos:** toggle **"Finanzas admin" por miembro** (nuevo flag en `workspace_members`). Consultor normal solo ve **sus** honorarios.
- **Ciclo de facturación:** cálculo + estado simple (Pendiente/Facturado/Cobrado) + histórico. Sin emisión real (AFIP) en v1.
- **Proyecto = account.** Las neuronas/engagements cuelgan del account.
- **Equipo por cuenta:** un account puede tener varios consultores asociados (modifica el portafolio).

## 2. Modelo de datos

Tablas nuevas en `lib/drizzle/schema/` (todas con `workspaceId` + índices, patrón existente). Montos: `numeric(14,2)`. Moneda: `text` `'USD' | 'ARS'`.

### 2.1 `account_finance` (1:1 con account)
Datos de facturación/legales + documentos + estado de extracción.
- `id`, `workspaceId`, `accountId` (unique → accounts cascade)
- Facturación: `razonSocial`, `cuit`, `billingEmail`, `ivaCondition`, `leadOrigin`, `clientEmail`, `clientResponsible` (responsable del proyecto en el cliente)
- Representante legal (del NDA): `legalRepName`, `legalRepDni`, `legalRepEmail`, `legalAddress`, `city`, `country`
- NDA: `ndaStoragePath` / `ndaUrl`, `ndaFileName`, `ndaExtractedText`, `ndaExtractionStatus` (`none|extracting|ready|error`), `ndaExtractionError`, `ndaExtractedAt`
- Propuesta: `proposalStoragePath` / `proposalUrl`, `proposalFileName`
- Términos NL: `termsRawText` (lo que escribió el consultor), `termsStatus` (`none|structuring|ready|error`), `termsError`, `termsStructuredAt`
- `createdAt`, `updatedAt`

### 2.2 `finance_engagements` (account + neurona)
- `id`, `workspaceId`, `accountId` (cascade)
- `neurona` text (idealmente coincide con `workspace.services`)
- `currency` text (`USD|ARS`) — moneda del fee
- `billingRule` text (`same | mep | mep_ipc`)
- `startDate` date (default kickoff del account), `endDate` date (nullable = en curso)
- `status` text (`active | paused | ended`)
- `sortOrder` int
- `createdAt`, `updatedAt`
- Índices: `(accountId)`, `(workspaceId)`, `(accountId, status)`

### 2.3 `finance_engagement_periods` (fee mes a mes)
Resuelve "mes 1 X, mes 2 Y, mes 3+ Z".
- `id`, `engagementId` (cascade), `accountId` (denormalizado), `workspaceId`
- `fromDate` date, `toDate` date (nullable = en curso)
- `fee` numeric(14,2), `currency` text
- `createdAt`, `updatedAt`
- Índice: `(engagementId)`, `(accountId)`

### 2.4 `finance_fee_shares` (reparto a consultores)
- `id`, `engagementId` (cascade), `accountId`, `workspaceId`
- `memberId` uuid → workspace_members (nullable hasta que el admin mapee)
- `consultantNameRaw` text (lo que dijo el LLM, para mapear)
- `shareType` text (`percent | fixed`)
- `shareValue` numeric(14,2) (porcentaje 0–100, o monto)
- `shareCurrency` text (nullable; aplica a `fixed`)
- `appliesFrom` date (nullable), `appliesTo` date (nullable) — para repartos que cambian
- `createdAt`, `updatedAt`
- Índices: `(engagementId)`, `(memberId)`, `(accountId)`

> `percent` se calcula contra el fee del período activo del engagement. `fixed` es un monto plano.

### 2.5 `account_consultants` (equipo por cuenta)
- `id`, `workspaceId`, `accountId` (cascade), `userId` → users (cascade)
- `neurona` text (nullable), `roleLabel` text (nullable, ej. "Project Leader")
- `createdAt`
- Unique `(accountId, userId, neurona)`; índice `(accountId)`

### 2.6 `member_compensation` (fijo recurrente por consultor)
- `id`, `workspaceId`, `userId` → users (cascade)
- `amount` numeric(14,2), `currency` text
- `effectiveFrom` date, `effectiveTo` date (nullable = vigente)
- `createdAt`, `updatedAt`
- Índice `(workspaceId, userId)`

### 2.7 `fx_rates` (MEP / IPC por mes)
- `id`, `workspaceId`
- `year` int, `month` int (1–12)
- `mepRate` numeric(14,4) — ARS por USD
- `ipcCoefficient` numeric(10,4) (nullable, default 1) — factor aplicado cuando `billingRule = mep_ipc`
- `createdByUserId`, `createdAt`, `updatedAt`
- Unique `(workspaceId, year, month)`

### 2.8 `billing_records` (qué facturar mensual + estado + histórico)
- `id`, `workspaceId`, `accountId` (cascade)
- `engagementId` uuid (nullable → para gastos adicionales)
- `year` int, `month` int
- `concept` text (neurona o "Gasto adicional: …")
- `amountOriginal` numeric(14,2), `currencyOriginal` text
- `amountArs` numeric(14,2) (convertido), `fxRateUsed` numeric(14,4) (nullable), `ipcUsed` numeric(10,4) (nullable)
- `status` text (`pending | billed | paid`), `billedAt`, `paidAt`
- `isAdditional` boolean default false
- `notes` text
- `createdAt`, `updatedAt`
- Unique parcial sugerida `(accountId, engagementId, year, month)` para records recurrentes (los adicionales no entran en el unique); índices `(workspaceId, year, month)`, `(accountId, year, month)`, `(workspaceId, status)`

### 2.9 Permisos
- Agregar `financeAdmin boolean not null default false` a **`workspace_members`**.

## 3. Flujos LLM (ambos: borrador editable, patrón task de trigger.dev)

### 3.1 Estructuración de términos (`structure-finance-terms`)
- Input: `account_finance.termsRawText` + contexto del account (neuronas de `serviceScope`, `fee`, kickoff/`startDate`, equipo `account_consultants`).
- Salida JSON validada (esquema): `engagements[]` con `{ neurona, currency, billingRule, startDate, endDate, periods[{fromMonth,toMonth,fee,currency}], shares[{consultantName, type, value, currency, appliesFromMonth, appliesToMonth}] }`, `additionalCharges[]`, `notes`.
- Post-proceso: convierte `fromMonth/toMonth` (relativos al inicio) a `fromDate/toDate` absolutos usando `startDate`; **escribe filas borrador** en `finance_engagements/periods/fee_shares` (reemplazando las generadas previamente que no fueron editadas a mano — ver §6 idempotencia); intenta mapear `consultantName` → `account_consultants`/miembros por nombre (como participantes), dejando `memberId` null si no hay match.
- Estado en `account_finance.termsStatus`. El admin revisa/edita las tablas. El cálculo usa las tablas.

### 3.2 Extracción de NDA (`extract-nda-fields`)
- Input: `account_finance.ndaExtractedText` (de archivo subido o texto pegado).
- Salida JSON: `{ razonSocial, cuit, billingEmail, ivaCondition, legalRepName, legalRepDni, legalRepEmail, legalAddress, city, country, clientResponsible }`.
- Escribe los campos como borrador en `account_finance`; el admin confirma/corrige. Estado en `ndaExtractionStatus`.

Ambos reusan `@anthropic-ai/sdk` (Haiku 4.5) + `logLlmUsage`, como el informe de Selección. Documentos: bucket privado `finance-docs` (NDA/Propuesta) o link de Drive (referencia). La extracción de NDA usa el texto del archivo subido (extracción cliente con pdfjs/mammoth, helper `lib/selection/extract-text-client.ts` reutilizado) o texto pegado; el link de Drive queda como referencia (sin fetch automático en v1).

## 4. Cálculos

### 4.1 Período activo
Un período/engagement está activo en el mes M si `fromDate <= finMes` y (`toDate` null o `toDate >= inicioMes`).

### 4.2 A facturar (mensual)
Para mes M, por cada account y engagement activo:
- `fee` = fee del período activo (moneda del período).
- Conversión a ARS según `billingRule`:
  - `same`: si moneda = ARS, monto directo; si USD, queda en USD (no se convierte).
  - `mep`: `amountArs = feeUSD × fx_rates[M].mepRate`.
  - `mep_ipc`: `amountArs = feeUSD × mepRate × ipcCoefficient`.
- Crea/actualiza `billing_records` (concept = neurona). Más `additionalCharges` del mes.
- El admin marca estado (Pendiente/Facturado/Cobrado).
- Si falta `fx_rates[M]` y hay engagements que requieren conversión → se marca el record como "TC pendiente" (sin `amountArs`) y la UI avisa.

**Histórico** = todos los `billing_records`. **LTV por cliente** = facturado histórico + proyección de períodos futuros hasta `endDate` (si no hay `endDate`, proyecta un horizonte configurable, default 12 meses, y la UI lo rotula como estimado). **Histórico mensual** = gráfico de `amountArs` por mes.

### 4.3 Honorarios (mensual, por consultor)
Para mes M y consultor U:
- **Fijo**: `member_compensation` vigente en M (monto + moneda).
- **Variable**: por cada engagement activo en M con `fee_share` de U (respetando `appliesFrom/To`):
  - `percent`: `shareValue% × feeDelPeríodoActivo` (moneda del engagement).
  - `fixed`: `shareValue` (en `shareCurrency`).
  - Conversión a moneda de visualización vía `fx_rates[M]` cuando corresponda.
- **Total** = fijo + Σ variables. Vista admin (todos) y vista consultor (solo U).

## 5. Permisos y UI

### 5.1 Acceso
- `financeAdmin` (en `workspace_members`): acceso completo.
- Resto de members: solo "Mis honorarios".
- La sección "Finanzas" del detalle del account: solo `financeAdmin`.
- Server actions y queries validan `financeAdmin` (helper `requireFinanceAdmin`), salvo "mis honorarios" que solo requiere ser miembro y filtra por el propio `userId`.

### 5.2 Pantalla `/app/finanzas`
- **Admin** — sub-secciones:
  - **A facturar**: selector de mes, lista (cliente, concepto, monto original→ARS, estado editable), totales, avisos de TC faltante. Histórico + proyecciones/LTV (gráfico mensual, LTV por cliente).
  - **Honorarios**: tabla por consultor del mes (fijo + desglose variable + total), con selector de mes.
  - **TC/IPC**: alta/edición de `fx_rates` por mes (MEP + IPC), con histórico.
- **Consultor** — **Mis honorarios**: su total del mes (fijo + variable por proyecto activo), desglose por proyecto/neurona, selector de mes.

### 5.3 Detalle del account → sección "Finanzas" (solo `financeAdmin`)
- **Equipo por cuenta** (`account_consultants`): asociar consultores (con neurona/rol).
- **Términos**: textarea NL + botón "Estructurar con IA" (genera borrador) + **tabla editable** de engagements → períodos → shares (CRUD manual). Mapeo de `consultantNameRaw` → miembro.
- **Documentos**: NDA y Propuesta (subir archivo o link Drive). Botón "Extraer datos del NDA".
- **Facturación/legales**: formulario de `account_finance` (editable; prellenado por la extracción).

### 5.4 Modificación al portafolio
- Mostrar el equipo (`account_consultants`) en el detalle del account; el alta de cuenta puede sugerir asociar consultores. (Cambio acotado, no rediseño.)

## 6. Idempotencia y edición
- La estructuración LLM **no pisa** filas editadas a mano: se marca el origen (`source: 'llm' | 'manual'`) en engagements/periods/shares (`source text default 'llm'`); al re-estructurar, se reemplazan solo las `llm` no tocadas. (Campo `source` agregado a 2.2/2.3/2.4.)
- `billing_records` recurrentes: la generación mensual hace upsert por `(accountId, engagementId, year, month)`; no duplica ni pisa el `status` ya marcado.

## 7. Fases (para el plan de implementación)
1. **Fundación**: schemas + migración + `financeAdmin` + permisos + `account_finance` + documentos + `account_consultants` + portafolio.
2. **Términos LLM**: NL + task `structure-finance-terms` + tabla editable de engagements/periods/shares.
3. **NDA LLM**: task `extract-nda-fields` + formulario facturación/legales.
4. **TC/IPC + A facturar**: `fx_rates` + generación/listado de `billing_records` + estados + histórico/LTV.
5. **Honorarios**: `member_compensation` + cálculo + vista admin + "Mis honorarios".

## 8. Fuera de alcance (v1)
- Emisión real de facturas / integración AFIP.
- Fetch automático de contenido desde links de Drive (NDA/Propuesta) — se usa archivo subido o texto pegado para extracción.
- API externa de MEP/IPC (carga manual).
- Multi-proyecto por cliente (un account = un proyecto).
- Fijo recurrente variable por neurona (es uno por persona).
