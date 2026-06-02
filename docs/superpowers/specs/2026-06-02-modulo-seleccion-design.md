# Módulo de Selección — Diseño

**Fecha:** 2026-06-02
**Estado:** Diseño aprobado pendiente de plan de implementación
**Referencias:** `REF/delenio-portal-v1.3.html` (qué debe incluir, NO la estética), `REF/Template de Informes.pdf` (estructura del informe LLM)

## 1. Resumen

Nuevo módulo **Selección** para nao: empresas que contrataron el servicio de selección de personal
pueden ver, en su portal de cliente, los perfiles de candidatos de sus búsquedas activas —con CV e
Informe profesional— y dar feedback (notas, calificación y decisiones de avanzar / rechazar / hacer
oferta). El equipo nao (admin) gestiona búsquedas y candidatos, sube el CV, carga notas del
reclutador y genera el Informe con IA.

El módulo se integra como **un módulo más de account** (igual que `crm`, `paid_media`), reutilizando:
- El sistema de módulos activables por account (`lib/modules-client.ts`).
- La vista pública de cliente por token (`/c/[token]`) con su share config.
- El patrón de IA existente (`lib/ai/*`, tasks de trigger.dev, `logLlmUsage`, modelo Haiku 4.5).

### Decisiones tomadas (brainstorming)
- **Encaje:** módulo de account. `account` = empresa cliente; `búsqueda` = posición dentro del account; `candidato` = perfil dentro de la búsqueda.
- **Acceso del cliente:** link por token (`/c/[token]`), como el resto de nao. Sin login propio.
- **Documentos:** CV soporta **ambos** (subir archivo a storage **o** pegar URL). El **Informe lo genera el LLM** (no se sube).
- **Informe:** **solo el admin** genera y **edita**. Se genera a partir de **CV + notas del reclutador + LinkedIn + descripción del puesto**.
- **Workflow:** completo (formularios condicionales del ref).
- **Estética:** design system propio de nao (glassmorphism, `GlassCard`, `lucide-react`). NO replicar el portal violeta de Delenio. En el detalle del candidato, **CV e Informe son el protagonista** (visor central grande) y los botones de decisión van **arriba y bien visibles**.
- **Alcance v1:** todo lo anterior en una sola entrega.

## 2. Modelo de datos

Tres tablas nuevas en `lib/drizzle/schema/`, todas con `workspaceId` + `accountId` para scoping e índices, siguiendo el patrón de las tablas existentes.

### `selection_searches` (búsquedas / posiciones)
- `id` uuid PK
- `workspaceId` → workspaces (cascade)
- `accountId` → accounts (cascade)
- `position` text not null — ej. "Senior Developer"
- `positionDescription` text — requisitos del puesto (alimenta el análisis de competencias del informe)
- `status` text not null default `'active'` — `active` | `paused` | `closed`
- `razonSocial` text — opcional, default del account
- `cuit` text — opcional
- `ownerId` → users (set null) — recruiter responsable
- `createdAt`, `updatedAt`, `closedAt` (nullable)
- Índices: `(accountId)`, `(workspaceId)`, `(accountId, status)`

### `selection_candidates` (perfiles)
- `id` uuid PK
- `searchId` → selection_searches (cascade)
- `accountId` → accounts (cascade) — denormalizado para queries/KPIs
- `workspaceId` → workspaces (cascade)
- Datos del perfil: `firstName`, `lastName`, `email`, `phone`, `linkedinUrl`, `expectedSalary` (text), `currentSalary` (text, opcional)
- `status` text not null default `'pending'` — `pending` | `advance` | `offer` | `rejected`
- Feedback del cliente: `clientRating` integer (0–5, 0 = sin calificar), `clientNotes` text
- Detalle de workflow (formularios condicionales):
  - `interviewModality` text (al avanzar: presencial/virtual/híbrida)
  - `interviewSchedule` text (al avanzar: horarios propuestos)
  - `offerConditions` text (al hacer oferta)
  - `rejectionReason` text (al rechazar — obligatorio en UI)
  - `feedbackAt` timestamp (última acción del cliente)
- CV:
  - `cvStoragePath` text — path en Supabase Storage (si se subió archivo)
  - `cvUrl` text — URL externa (si se pegó link)
  - `cvFileName` text, `cvMimeType` text, `cvFileSize` integer
  - `cvExtractedText` text — texto extraído del CV para alimentar el LLM
- Notas del reclutador (admin, insumo del informe): `recruiterNotes` text
- Informe (LLM):
  - `reportContent` text — markdown generado/editado
  - `reportStatus` text not null default `'none'` — `none` | `generating` | `ready` | `error`
  - `reportError` text (nullable)
  - `reportGeneratedAt` timestamp, `reportEditedAt` timestamp
- `createdAt`, `updatedAt`
- Índices: `(searchId)`, `(accountId)`, `(accountId, status)`, `(searchId, status)`

> "Pendientes por feedback" = candidatos con `status = 'pending'`. No se necesita tabla de eventos en v1.

### Storage de CV
- **Bucket privado de Supabase Storage**: `selection-cvs` (infra nueva para nao — hoy no persiste binarios).
- Subida desde server action admin; se guarda `cvStoragePath` y se extrae texto a `cvExtractedText` (reutilizar utilidad de extracción PDF/DOCX existente — `pdfjs-dist` / `mammoth`).
- Visualización: signed URL temporal (server action) para el visor/descarga, tanto en admin como en cliente.
- Si el admin pega URL en vez de subir: se guarda en `cvUrl` y el visor la usa directamente (no hay texto extraído salvo que se quiera fetch — v1: el informe en ese caso usa solo notas + LinkedIn + puesto).

## 3. Módulo de account

- Agregar `{ key: "selection", label: "Selección", description: "Búsquedas y candidatos del servicio de selección" }` a `ACCOUNT_MODULES` en `lib/modules-client.ts`.
- Se activa por account (toggle existente en alta/edición de account) y se respeta en el share config del link de cliente.

## 4. Vista admin (equipo nao)

Nueva sección **"Selección"** en el detalle del account (`app/(protected)/app/accounts/[accountId]/...`), visible solo si el módulo está activo.

### 4.1 Header con KPIs del cliente
Los KPIs pedidos, calculados para ese account:
- **Búsquedas activas** (`status = 'active'`)
- **Candidatos totales**
- **Pendientes por feedback** (`candidatos.status = 'pending'`)

### 4.2 Lista de búsquedas
- Cards (`GlassCard`) por búsqueda: posición, estado, nº candidatos, nº pendientes.
- Acción: **Nueva búsqueda** (modal/form: posición, descripción del puesto, razón social, CUIT, estado).
- Abrir una búsqueda → vista de candidatos.

### 4.3 Vista de candidatos (split-view, estética nao)
- **Panel izquierdo:** lista de candidatos con buscador y filtro por estado; chips de métricas (pendientes/avanza/oferta/descartados).
- **Panel derecho (detalle) — CV e Informe como protagonista:**
  - **Barra de acciones arriba y visible:** estado actual + botones de decisión (espejo del cliente) y datos clave (nombre, email, tel, LinkedIn, remuneración pretendida) compactos.
  - **Visor grande con tabs CV / Informe** (centro de la pantalla):
    - CV: visor del archivo (signed URL) o link externo + descarga.
    - Informe: render del markdown + botones **Generar informe** (dispara task LLM) y **Editar** (textarea markdown, guarda `reportContent` + `reportEditedAt`). Estado `generating` muestra spinner; `error` muestra reintento.
  - Sección **Notas del reclutador** (`recruiterNotes`) — insumo del informe.
  - Feedback del cliente (solo lectura para el admin): `clientNotes`, `clientRating`, detalle de workflow.
- Acciones admin: **Agregar candidato** (form: nombre, apellido, email, tel, LinkedIn, remuneración; CV subir/URL), editar, eliminar.

## 5. Vista cliente (`/c/[token]`)

Nueva sección **"Selección"** dentro de `PublicAccountView`, renderizada si el módulo está activo y habilitado en el share config.

- Lista de búsquedas activas del account → abrir → split-view (misma jerarquía visual que admin, **CV + Informe protagonistas**).
- Detalle del candidato (cliente):
  - **Arriba y visible:** botones **Avanzar** · **Rechazar** · **Hacer Oferta** con formularios condicionales:
    - Avanzar → modalidad (presencial/virtual/híbrida) + horarios.
    - Hacer Oferta → condiciones.
    - Rechazar → motivo (**obligatorio**).
  - Datos del perfil (nombre, email, tel, LinkedIn, remuneración pretendida).
  - **Visor CV / Informe** (tabs, centro).
  - **Notas** (textarea) + **Calificación** (estrellas 0–5).
- **Writes del cliente** vía server actions validadas por token: se verifica que el `token` esté activo, que apunte al account, y que el candidato pertenezca a una búsqueda de ese account. Se setea `status`, campos de workflow, `clientNotes`, `clientRating`, `feedbackAt`. El cliente **no** puede crear/editar candidatos, subir CV ni generar/editar el informe.

## 6. Generación del Informe (LLM)

- Nueva task de trigger.dev **`generate-selection-report`** (async).
  - Input: `{ candidateId, workspaceId }`.
  - Lee `cvExtractedText` + `recruiterNotes` + `linkedinUrl` + `positionDescription` (de la búsqueda) + nombre.
  - Llama a Anthropic (Haiku 4.5, patrón de `lib/ai/*`) con un system prompt derivado del template (`REF/Template de Informes.pdf`): secciones **Resumen ejecutivo · Datos generales · Resumen académico · Resumen de experiencia laboral · Motivación al cambio laboral · Compensación actual y pretendida + Beneficios · Análisis de competencias (soft/hard) según el puesto · Recomendaciones estratégicas**. Tono profesional, objetivo, sin juicios, solo con info provista.
  - Salida en **markdown** → guarda `reportContent`, `reportStatus = 'ready'`, `reportGeneratedAt`. Errores → `reportStatus = 'error'` + `reportError`. Registra `logLlmUsage`.
- Disparo: server action admin pone `reportStatus = 'generating'` y encola la task. La UI refleja el estado al recargar (sin realtime en v1).
- Edición manual: server action admin guarda `reportContent` + `reportEditedAt` (no toca el flujo del LLM).
- **Deploy:** tocar `trigger/tasks/*` requiere redeploy del worker; ya está automatizado vía `.github/workflows/trigger-deploy.yml` en push a master.

## 7. Server actions / queries (resumen)

- Admin (`app/actions/selection.ts`, requieren `requireUserId` + scope de workspace):
  - `createSearch`, `updateSearch`, `closeSearch`
  - `createCandidate`, `updateCandidate`, `deleteCandidate`
  - `uploadCandidateCv` (storage + extracción) / `setCandidateCvUrl`
  - `saveRecruiterNotes`
  - `generateCandidateReport` (encola task), `saveCandidateReport` (edición manual)
  - `getCandidateCvSignedUrl`
- Cliente (`app/actions/selection-client.ts` o inline en la page, validadas por token):
  - `clientSetCandidateStatus` (avanzar/rechazar/ofertar + campos de workflow)
  - `clientSaveCandidateFeedback` (notas + rating)
  - `clientGetCandidateCvSignedUrl`
- Queries:
  - Admin KPIs y listados (`lib/queries/selection.ts`).
  - Snapshot público: extender `getPublicAccountSnapshot` (o helper paralelo) para incluir búsquedas + candidatos cuando el módulo está habilitado en el share config.

## 8. Componentes (estética nao)

- `components/selection/` (compartibles admin/cliente donde aplique): lista de candidatos, detalle con visor CV/Informe, barra de acciones, formularios de workflow, rating de estrellas.
- `components/public-account-view/selection-section.tsx` para el portal de cliente.
- Usar `GlassCard`, `lucide-react`, `cn()` + Tailwind. Sin estilos inline. Visor de CV/Informe como elemento central.

## 9. Migraciones

- 3 tablas nuevas → `npm run db:generate` + **down migration** por cada una antes de `db:migrate` (workflow obligatorio de nao).
- Crear bucket `selection-cvs` (privado) en Supabase.

## 10. Fuera de alcance (v1)

- Login/roles propios de cliente (se usa token).
- Tabla de eventos/auditoría de cambios de estado.
- Realtime del estado del informe (se refleja al recargar).
- Tabla de permisos editable del ref (los permisos del cliente son fijos: feedback sí, gestión no).
- Asignación de usuarios/recruiters por búsqueda del ref (nao usa workspace members).
- Fetch automático de contenido desde `cvUrl` externa para el informe.
