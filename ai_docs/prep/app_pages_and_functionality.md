# App Pages & Functionality Blueprint

### App Summary

**End Goal:** plani.fyi helps growth teams, agencies, and consultancies managing multiple client accounts achieve clear, updated, and actionable visibility of each account's status using AI-powered transcript and data processing.
**Core Value Proposition:** Siempre sabés cómo está cada cuenta — sin depender de la memoria del equipo.
**Target Users:** Account Managers / Growth Strategists, Team Leads / Management, System Administrators; Client Stakeholders (post-MVP)
**Template Type:** worker-saas (background job processing with Trigger.dev)

---

## Workflow Overview

### Input → Process → Output Flow

**📥 Workflow Inputs**
- **Input Type:** Upload de transcripciones de reuniones (texto pegado o archivo .txt/.docx) + actualizaciones manuales de cuenta
- **Input Format:** Texto plano o archivo de transcripción; notas y decisiones manuales como texto libre
- **Input Validation:** Límite de palabras por tier; sin restricciones de formato complejas (es texto)
- **Trigger Mechanism:** Acción del usuario (upload o submit) desde la pantalla de cuenta

**⚙️ Processing Steps (Background Job via Trigger.dev)**
1. Ingestión y limpieza del texto de transcripción (0-10%)
2. Extracción de participantes sugeridos de la transcripción (10-20%)
3. Extracción de tareas y próximos pasos con AI (20-45%)
4. Generación de resumen y estado de situación de la cuenta (45-70%)
5. Detección de señales de salud, riesgo y oportunidad (70-90%)
6. Actualización del estado general de la cuenta (90-100%)

**📤 Workflow Outputs**
- **Output principal:** Estado actualizado de la cuenta — resumen AI, señal de salud (verde/amarillo/rojo), tareas extraídas, riesgos y oportunidades detectados
- **Output de participantes:** Lista de participantes sugeridos por AI para confirmación/corrección manual
- **Output secundario:** Historial de procesamiento por transcripción (qué detectó cada reunión)
- **Output de portfolio:** Vista consolidada de todas las cuentas con sus señales de salud
- **Output formato:** Todo en pantalla (no archivos descargables en MVP)

**⚡ Real-Time Requirements**
- Duración estimada: 15-45 segundos por transcripción con LLM calls
- **Patrón: Trigger.dev Real-Time Streaming** — `useRealtimeRun()` + `metadata.set()` para mostrar el paso activo
- El usuario ve la cuenta actualizarse en tiempo real mientras el job corre
- Para actualizaciones manuales: polling simple (no necesita streaming)

---

## Lógica de Participantes de Reunión

### Extracción y Confirmación (MVP)

**Extracción automática:**
- El background job detecta participantes a partir de la transcripción: nombres propios, patrones "Nombre:" de turno de palabra, firmas de email si están presentes
- Los participantes se almacenan como "sugeridos" ligados al job de transcripción

**Flujo de confirmación:**
- Al completar el procesamiento, la cuenta muestra una sección "Participantes sugeridos en esta reunión" con un chip por participante detectado
- El usuario puede: confirmar (el participante queda asociado a esa transcripción y a la cuenta), editar el nombre, eliminar un falso positivo, o agregar participantes manualmente
- Los participantes confirmados pasan a ser "contactos conocidos" de la cuenta

**Memoria acumulada por cuenta:**
- Si un participante ya fue confirmado en esa cuenta en reuniones anteriores, aparece pre-seleccionado en futuras transcripciones (sugerido con mayor confianza)
- Esto evita tener que confirmar siempre los mismos contactos y construye el contexto de la cuenta con el tiempo

**Relaciones del modelo:**
- `participants` — entidad con nombre, email (opcional), cuenta a la que pertenece
- `transcript_participants` — join table: transcripción procesada + participante + estado (sugerido/confirmado)
- Los participantes confirmados son visibles en el perfil de la cuenta como "contactos clave involucrados"

---

## Lógica de Deduplicación e Idempotencia

### Detección de Duplicados

- Al subir una transcripción, el sistema calcula un hash del contenido normalizado (SHA-256 sobre texto en minúsculas, sin espacios extra)
- Si existe un job previo con ese hash en la misma cuenta (sin importar estado), se muestra un warning: "Esta transcripción parece haber sido procesada antes el [fecha]"
- El usuario puede: cancelar el upload o proceder igualmente (para casos donde quiera reforzar con nueva corrida)
- El hash se almacena en el job record para comparación futura

### Política de Reintento (mismo job fallido)

- Un reintento de job fallido usa el mismo `jobId` — NO crea tareas, señales o resumen nuevos hasta que el job complete exitosamente
- Si el reintento completa: reemplaza los resultados parciales del job fallido in-place
- Si el reintento falla de nuevo: el estado del job vuelve a "failed" sin acumular basura
- El reintento es idempotente por diseño: el job siempre escribe sobre su propio `jobId`

### Política de Nueva Transcripción (contenido distinto, misma cuenta)

- Las tareas nuevas extraídas se SUMAN a las existentes de la cuenta (no reemplazan)
- El resumen de cuenta se REGENERA incorporando el contexto acumulado (historial de transcripciones anteriores como contexto del prompt)
- Las señales se ACTUALIZAN por tipo — una cuenta no puede tener dos señales activas del mismo tipo (ej: dos "riesgo de churn"). La señal nueva del mismo tipo reemplaza a la anterior, registrando la fecha de actualización
- Los participantes sugeridos de nuevas transcripciones se proponen para confirmación; si ya existen como confirmados, se vinculan automáticamente a la nueva transcripción sin duplicar el contacto

### Reglas de negocio para señales

- Tipos de señal definidos: `churn_risk`, `growth_opportunity`, `upsell_opportunity`, `inactivity_flag`, `custom`
- Por cada tipo, solo puede haber una señal activa por cuenta
- Las señales tienen estado: `active` / `resolved` — el usuario puede marcarlas como resueltas
- Una nueva señal del mismo tipo en estado `active` reemplaza la anterior (con nuevo texto y fecha)

---

## Universal SaaS Foundation

### Public Marketing Pages

- **Landing Page** — `/`
  - Hero: "Siempre sabés cómo está cada cuenta — sin depender de la memoria"
  - Problema: "La información crítica de cada cliente está dispersa en reuniones, notas y mails. El seguimiento depende de quién recuerda qué."
  - Features: Cargá la transcripción → AI extrae tareas, detecta riesgos, actualiza el estado → Tu equipo siempre sabe dónde está cada cuenta
  - Pricing (3 tiers): Free / Starter / Pro
  - FAQ: ¿Qué formatos de transcripción acepta? ¿Cuántas cuentas puedo gestionar? ¿Los clientes pueden ver su cuenta?
  - CTA: "Empezá gratis — procesá tu primera transcripción"

- **Legal Pages** — `/privacy`, `/terms`
  - Privacy policy (GDPR)
  - Terms of service

### Authentication Flow

- **Login** — `/auth/login` (Email/password + OAuth Google/GitHub)
- **Sign Up** — `/auth/sign-up` (Registro, auto-asigna Free tier)
- **Forgot Password** — `/auth/forgot-password`
- **Email Verification** — `/auth/verify-email`

---

## Core Application Pages

### Portfolio Dashboard — `/app/portfolio`

- **Vista de cartera** (Frontend):
  - Grid o lista de todas las cuentas del workspace
  - Tarjeta por cuenta: nombre, responsable, señal de salud (badge verde/amarillo/rojo), última actividad, cantidad de tareas abiertas
  - Cuentas sin actividad reciente: badge "Sin actividad" con días transcurridos
  - Ordenamiento: por estado de salud (riesgos primero), por última actividad, por responsable
- **Filtros** (Frontend):
  - Por estado de salud (verde/amarillo/rojo/sin actividad)
  - Por responsable asignado
  - Por última actividad (últimos 7/30 días)
- **Acciones** (Frontend + Server Actions):
  - "Nueva cuenta" → modal de creación
  - Click en cuenta → navega a `/app/accounts/[accountId]`
- **Empty state**: "Creá tu primera cuenta para empezar a gestionar tu cartera"

### Account Detail Page — `/app/accounts/[accountId]`

Esta es la página central del producto. Combina input (upload), job tracking en tiempo real y el estado completo de inteligencia de la cuenta.

- **Header de cuenta** (Frontend):
  - Nombre del cliente, responsable asignado, señal de salud actual (badge editable)
  - Fecha de última actualización AI
  - Botón "Editar cuenta" (nombre, objetivos, contactos, scope de servicio)
  - Botón "Eliminar cuenta" (con confirmación)

- **Resumen AI + Estado de Situación** (Frontend):
  - Bloque de resumen generado por AI: estado actual, contexto clave, últimas novedades
  - Editable por el usuario (puede corregir o ajustar el resumen generado)
  - Señal de salud con justificación breve ("Riesgo detectado: sin feedback sobre propuesta enviada")

- **Zona de Input — Upload de Transcripción** (Frontend + Server Action):
  - Drag-drop o textarea para pegar texto de transcripción
  - Detección de duplicado: si el hash ya existe en esta cuenta, muestra warning con opción de cancelar o proceder
  - Validación de cuota por tier (Frontend + Backend):
    - Free: hasta 5 transcripciones/mes, máx 10.000 palabras
    - Starter: hasta 30 transcripciones/mes, máx 30.000 palabras
    - Pro: ilimitado, máx 100.000 palabras
  - Quota display: "X transcripciones restantes este mes"
  - Submit → Server Action → valida cuota → calcula hash → detecta duplicado → crea job record → dispara Trigger.dev task

- **Zona de Input — Actualización Manual** (Frontend + Server Action):
  - Textarea para agregar nota, decisión o contexto sin transcripción
  - Submit inmediato → sin background job → se agrega al historial de la cuenta con timestamp

- **Job activo — Progreso en tiempo real** (Frontend con `useRealtimeRun()`):
  - Visible solo cuando hay un job procesando
  - Barra de progreso + texto del paso actual ("Detectando señales de riesgo...")
  - Stages visibles: Procesando texto → Identificando participantes → Extrayendo tareas → Generando resumen → Detectando señales
  - Se actualiza en tiempo real sin refresh
  - Al completarse: desaparece y la cuenta se actualiza automáticamente

- **Contactos del Cliente** (Frontend + Server Actions):
  - Directorio de contactos asociados a la cuenta (perfil vCard simplificado)
  - Por contacto: nombre, rol/cargo, email, teléfono (opcional), URL de LinkedIn (opcional)
  - Fuente del contacto: `ai_extracted` (detectado en transcripción y confirmado) o `manual` (agregado directamente)
  - Acciones: editar perfil completo, eliminar contacto
  - Botón "Agregar contacto" → modal con campos nombre, rol, email, teléfono, LinkedIn
  - Visible en la cuenta independientemente de las transcripciones

- **Personas y Reuniones** (Frontend + Server Actions):
  - Directorio ampliado de todas las personas que han participado en reuniones de esta cuenta
  - Tabs: [Todos] [Contactos del cliente] [Equipo interno]
  - Por persona: nombre, rol, # reuniones en las que participó, última reunión
  - Acciones sobre la última transcripción procesada: confirmar, editar, eliminar falso positivo
  - Participantes ya confirmados en transcripciones anteriores: pre-seleccionados automáticamente en nuevas confirmaciones
  - Agregar participante manualmente (si no fue detectado por AI)
  - Los confirmados se sincronizan con el directorio de Contactos del Cliente (Server Action)

- **Tareas y Próximos Pasos** (Frontend + Server Actions):
  - Lista de tareas extraídas por AI, ordenadas por prioridad
  - Por tarea: descripción, reunión de origen, fecha, estado (pendiente/completada)
  - Acciones: marcar completada, editar, eliminar
  - Agregar tarea manual
  - Filtro: Pendientes / Completadas

- **Resultados de Paid Media y CRM** (Frontend — Phase 2, visible solo si la cuenta tiene ad_connections activas):
  - Selector de período: [Últimos 7d / 30d / 90d / personalizado]
  - Métricas resumen: Leads generados, SQL (de CRM), Inversión total, CPL, ROAS promedio
  - Desglose por canal (Google Ads, Meta Ads, LinkedIn Ads):
    - Inversión, Leads, CPL, ROAS, CTR por canal
  - Creatividades activas: contador + link a detalle
  - Estado vacío si no hay ad connections: "Conectá tus cuentas publicitarias para ver métricas aquí"
  - Link "Ver campañas en detalle →" → `/app/accounts/[accountId]/campaigns`

- **Señales Detectadas** (Frontend + Server Actions):
  - Sección de riesgos activos (badge rojo): descripción + fecha de detección
  - Sección de oportunidades activas (badge verde): descripción + fecha
  - Solo una señal activa por tipo — la más reciente reemplaza a la anterior del mismo tipo
  - Acciones por señal: marcar como resuelta, editar descripción, eliminar
  - Historial de señales resueltas (colapsado)

- **Historial de Procesamiento** (Frontend):
  - Lista de transcripciones y notas procesadas, ordenadas por fecha descendente
  - Por entrada: fecha, tipo (transcripción/nota manual), participantes confirmados, extracto, estado (procesado/error)
  - Acciones: "Ver detalle", "Eliminar" (Server Action — al eliminar, las tareas y señales generadas por esa transcripción se mantienen, solo se elimina el registro)
  - Paginación: 10 por página

- **Error handling**:
  - Job fallido: mensaje claro + botón "Reintentar" (Server Action crea nuevo intento sobre el mismo jobId — no duplica resultados)
  - Correcciones manuales siempre disponibles aunque falle AI

### Campaign Detail — `/app/accounts/[accountId]/campaigns` (Phase 2)

Vista completa de campañas de adquisición de la cuenta, agrupadas por canal. Accesible desde el bloque "Resultados de Paid Media y CRM" en el Account Detail.

- **Header**: nombre de cuenta + selector de período (7d / 30d / 90d / personalizado)
- **Botón "Sincronizar"**: dispara sync manual de métricas (Server Action → Trigger.dev task)
- **Resumen consolidado** (todos los canales):
  - Inversión total, Leads, SQL, CPL promedio, Lead→SQL%, ROAS promedio, Creatividades activas
- **Tabs por canal**: [Google Ads] [Meta Ads] [LinkedIn Ads]
- **Por canal** (contenido del tab):
  - Lista de campañas activas con métricas: nombre, inversión, leads, CPL, ROAS, CTR, conversiones
  - Creatividades activas por campaña: contador
  - Estado de campaña: activa / pausada / finalizada
- **Métricas configurables** por workspace (cuáles columnas mostrar):
  - Checkbox de columnas: Impresiones, Clics, CTR, CPL, CPC, ROAS, Conversiones, CPM
  - Configuración guardada por usuario (Server Action)
- **Estado vacío si canal no conectado**: "Conectá tu cuenta de [canal] para ver campañas"
- Back link: "← Volver a [nombre cuenta]"

### Transcript Processing Detail — `/app/accounts/[accountId]/transcripts/[transcriptId]`

- Vista de qué extrajo una transcripción específica
- Resumen generado para esa reunión puntual
- Tareas extraídas de esa reunión
- Participantes confirmados y sugeridos de esa reunión
- Señales detectadas en esa reunión
- Texto original de la transcripción (colapsado)
- Back link: "← Volver a [nombre cuenta]"
- Acciones: "Eliminar transcripción" (con confirmación)

### New Account — `/app/accounts/new` (o modal desde portfolio)

- Nombre del cliente
- Objetivos de la cuenta
- Contactos clave iniciales (nombre, rol, email opcional)
- Scope de servicio (texto libre)
- Responsable interno asignado
- Submit → Server Action → crea cuenta → redirige a Account Detail

### Profile — `/app/profile`

- **Información de cuenta**:
  - Avatar, nombre, email
  - Cambiar contraseña
  - Eliminar cuenta (con confirmación)
- **Billing Management** (desde Stripe API en real-time):
  - Plan actual, fecha de renovación, método de pago
  - Botón "Gestionar billing" → Stripe Customer Portal
- **Uso del mes**:
  - Transcripciones procesadas este mes: barra de progreso [X]/[Y]
  - Cuentas activas: [X]/[Y]
- **Estadísticas del usuario** (acumulado desde registro):
  - Total de transcripciones procesadas
  - Total de tareas extraídas por AI
  - Total de señales detectadas / resueltas
  - Cuenta más activa (por transcripciones procesadas)
- **Planes disponibles**:
  - Free (gratis): descripción y límites
  - Starter ($49/mes): descripción y límites — badge "Más popular"
  - Pro ($99/mes): descripción y límites
  - Botones de upgrade → Stripe Checkout (para Free/Starter)

---

## Admin Features

### Admin Dashboard — `/admin/dashboard`

- **Métricas del sistema**:
  - Total usuarios, usuarios por tier
  - Total de jobs (hoy/semana/mes)
  - Jobs activos (procesando ahora)
  - Jobs fallidos, tasa de error
- **Job statistics chart** (últimos 30 días):
  - Jobs procesados por día
  - % completados vs fallidos
  - Tiempo promedio de procesamiento
- **System health**:
  - Estado de la queue, tiempo promedio de espera
  - Estado de APIs externas

### Users — `/admin/users`

- Tabla de usuarios: email, plan, uso del mes, fecha de registro
- Filtros: por tier, por estado
- Acciones: ver detalle, suspender cuenta, ajuste manual de cuota

---

## Navigation Structure

### Main Sidebar (Responsive)

- 📋 **Portfolio** — Vista consolidada de todas las cuentas con señales de salud
- 🗂️ **Cuentas** — Lista de cuentas (si se maneja separado del portfolio)
- 👤 **Perfil** — Cuenta, billing, uso, suscripción
- 📊 **Admin** (solo admin — role-based):
  - Dashboard — Métricas del sistema
  - Usuarios — Gestión de usuarios

### Usage Stats Box (Sidebar Footer)

- "[X]/[Y] transcripciones este mes"
- "Plan [Free/Starter/Pro]"
- Barra de progreso de cuota

### Mobile Navigation

- Bottom tab bar: Portfolio, Cuentas, Perfil
- Header: Logo plani.fyi (izquierda), avatar dropdown (derecha)

---

## Next.js App Router Structure

### Layout Groups

```
app/
├── (public)/          # Marketing y legales (sin auth)
├── (auth)/            # Flujo de autenticación
├── (protected)/       # App autenticada (user role)
└── (admin)/           # Páginas solo admin
```

### Complete Route Mapping

**🌐 Public Routes**
- `/` → Landing page con pricing embedded
- `/privacy` → Política de privacidad
- `/terms` → Términos de servicio

**🔐 Auth Routes**
- `/auth/login` → Login
- `/auth/sign-up` → Registro
- `/auth/forgot-password` → Reset de password
- `/auth/verify-email` → Verificación de email

**🛡️ Protected Routes**
- `/app/portfolio` → Portfolio dashboard (todas las cuentas)
- `/app/accounts/new` → Crear cuenta nueva
- `/app/accounts/[accountId]` → Account detail (input + progreso + inteligencia completa)
- `/app/accounts/[accountId]/transcripts/[transcriptId]` → Detalle de transcripción procesada
- `/app/accounts/[accountId]/campaigns` → Detalle de campañas de adquisición por canal (Phase 2)
- `/app/profile` → Perfil, billing, uso, estadísticas del usuario

**👑 Admin Routes**
- `/admin/dashboard` → Métricas del sistema
- `/admin/users` → Gestión de usuarios

### Backend Architecture

**API Endpoints (solo comunicación externa)**
- `/api/webhooks/stripe/route.ts` → Webhooks de Stripe
- `/api/webhooks/trigger/route.ts` → Callbacks de Trigger.dev (opcional)

**Server Actions**
- `app/actions/accounts.ts` → Crear/editar/eliminar cuentas, actualizar señales, editar resumen
- `app/actions/transcripts.ts` → Upload, crear job, reintentar job (idempotente sobre mismo jobId), eliminar
- `app/actions/participants.ts` → Confirmar/editar/eliminar participantes sugeridos, agregar manual
- `app/actions/tasks.ts` → Crear/completar/editar/eliminar tareas
- `app/actions/signals.ts` → Marcar señal como resuelta, editar, eliminar
- `app/actions/subscription.ts` → Checkout session, Stripe Portal link
- `app/actions/profile.ts` → Actualizar perfil, cambiar password, eliminar cuenta
- `app/actions/admin.ts` → Gestión de usuarios, métricas

**Lib Queries**
- `lib/queries/accounts.ts` → Get accounts, portfolio summary, account detail
- `lib/queries/transcripts.ts` → Get jobs, processing status, transcript history, hash check
- `lib/queries/participants.ts` → Get participants by account, by transcript
- `lib/queries/tasks.ts` → Get tasks by account, by transcript
- `lib/queries/signals.ts` → Get signals by account, by type
- `lib/queries/usage.ts` → Check quotas, track monthly usage
- `lib/queries/subscriptions.ts` → Get subscription status from Stripe
- `lib/queries/admin.ts` → System metrics, job queue status

**Architecture Flow**
- **Internal operations**: Frontend → Server Actions → Lib Queries → Database (Supabase)
- **External services**: Frontend → API Endpoint → External Service (Stripe/Trigger.dev)
- **Webhooks**: External Service → API Webhook → Server Action → Lib Queries → Database

---

## Business Model Integration

### Subscription Tiers & Quota Enforcement

**Free (sin costo)**
- Hasta 2 cuentas activas
- 5 transcripciones procesadas/mes, máx 10.000 palabras c/u
- Sin vista de portfolio para management
- Sin detección avanzada de señales
- Acceso básico a tareas y resúmenes

**Starter (~$49/mes)**
- Hasta 10 cuentas activas
- 30 transcripciones/mes, máx 30.000 palabras c/u
- Vista de portfolio para management
- Detección completa de señales (riesgo, oportunidad, inactividad)
- Historial completo de transcripciones

**Pro (~$99/mes)**
- Hasta 30 cuentas activas
- Transcripciones ilimitadas, máx 100.000 palabras c/u
- Todo lo de Starter
- Configuración flexible por cuenta (métricas y fuentes personalizadas)
- Vista cliente read-only (post-MVP feature unlock)

### Stripe Integration Architecture

**Subscription Flow:**
1. Usuario se registra → Free tier asignado automáticamente
2. Usuario hace upgrade → Stripe Checkout session
3. Pago completo → Stripe webhook actualiza estado
4. Renovación mensual → Stripe auto-cobra, cuota de uso se resetea
5. Cancelación → Suscripción activa hasta fin del período, luego downgrade a Free

**Database Schema:**
- `users` table: `stripe_customer_id` (único campo Stripe-relacionado)
- `accounts` table: cuenta de cliente con estado, señal de salud, responsable
- `transcripts` table: job records con status, hash, progress, jobId de Trigger.dev
- `participants` table: nombre, email (opcional), rol/cargo (opcional), teléfono (opcional), linkedin_url (opcional), accountId, source_type (ai_extracted | manual), total_meetings, last_meeting_at
- `transcript_participants` table: transcriptId + participantId + status (suggested/confirmed)
- `tasks` table: descripción, accountId, transcriptId (origen), estado
- `signals` table: tipo, descripción, accountId, estado (active/resolved)
- `usage_tracking` table: userId, month, transcripts_count, words_processed
- `ad_connections` table: accountId, platform, adAccountId, tokens, status, has_active_campaigns (Phase 2)
- `ad_metrics` table: historical daily rows por campaña/canal (Phase 2)
- `ad_metrics_snapshots` table: snapshot agregado por cuenta (Phase 2)

**Quota Enforcement:**
- Antes de crear un job: Server Action valida cuota del mes y límite de cuentas
- Frontend muestra quota restante con warning al acercarse al límite
- Upgrade prompt cuando se alcanza el límite
- Hash check antes de crear job para detectar duplicados

---

## MVP Functionality Summary

**Phase 1 (Launch Ready):**
- Universal SaaS foundation (auth, legal, responsive design)
- Portfolio dashboard con señales de salud por cuenta
- Account detail con upload de transcripción + procesamiento AI + inteligencia completa
- Extracción y confirmación de participantes de reunión por transcripción
- Deduplicación por hash + política de reintento idempotente
- Tareas extraídas por AI con gestión manual
- Señales de salud deduplicadas por tipo con estado active/resolved
- Actualizaciones manuales de cuenta (sin background job)
- Real-time job progress tracking con Trigger.dev (5 stages visibles)
- 3-tier subscription system con Stripe integration (Free/Starter/Pro)
- Quota enforcement y usage tracking por tier
- Admin: métricas del sistema y gestión de usuarios
- Mobile-responsive design con sidebar colapsable

**Phase 2 (Growth Features):**
- Vista cliente read-only por cuenta
- Google Drive folder sync para auto-importar transcripciones
- Integraciones con Google Ads, Meta Ads (métricas por cuenta)
- AI-generated client report exportable (PDF)
- Account timeline / activity log
- Risk and opportunity digest semanal (email)
- Configuración flexible por cuenta (métricas y fuentes personalizadas)
- Notificaciones email al completar procesamiento

**Technology Stack:**
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS v4
- **Backend**: Next.js Server Actions, API Routes (webhooks only)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email/password + OAuth)
- **Background Jobs**: Trigger.dev (AI transcript processing)
- **Payments**: Stripe (Checkout, Customer Portal, Webhooks)
- **External Services**: Anthropic Claude API (transcript processing, signal detection)

**Key Design Decisions:**
- Entidad principal: Cuenta (no transcripción) — las transcripciones son inputs que actualizan el estado de cuenta
- Participantes extraídos por AI → confirmación manual → memoria acumulada por cuenta
- Deduplicación por hash SHA-256 del contenido normalizado
- Reintentos idempotentes: siempre sobre el mismo jobId, nunca duplican resultados
- Señales deduplicadas por tipo: solo una señal activa por tipo por cuenta
- Canonical page pattern: `/accounts/` + `/accounts/[accountId]` + `/accounts/[accountId]/transcripts/[transcriptId]` + `/accounts/[accountId]/campaigns` (Phase 2)
- Real-time progress via Trigger.dev streaming (`useRealtimeRun()` + `metadata.set()`)
- Stripe como única fuente de verdad para suscripciones
- Server Actions para lógica interna, API routes solo para webhooks externos
- Sin páginas de billing custom — todo via Stripe Customer Portal

---

**Total: 13 páginas (Phase 1: 12 | Phase 2: +1)**
- Public: 3 (landing, privacy, terms)
- Auth: 4 (login, sign-up, forgot-password, verify-email)
- Protected Phase 1: 5 (portfolio, accounts/new, account detail, transcript detail, profile)
- Protected Phase 2: 1 (campaigns detail)
- Admin: 2 (dashboard, users)
