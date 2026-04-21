# Wireframe Reference Doc

**App:** plani.fyi
**Generated:** 2026-04-16

---

### ASCII / Markdown Mock-ups

```text
=======================================================================
PAGE 1: Portfolio Dashboard   /app/portfolio
=======================================================================

+------------------------------------------------------------------+
| [plani.fyi]    |  Portfolio                      [+ Nueva cuenta]|
|----------------|--------------------------------------------------|
| 📋 Portfolio   |  Filtros: [Salud ▼] [Responsable ▼] [Actividad ▼]|
| 🗂️  Cuentas    |                                                   |
| 👤 Perfil      |  +------------------+ +------------------+       |
| ── Admin ──    |  | Acme Corp        | | Globex Inc       |       |
| 📊 Dashboard   |  | 🔴 Riesgo        | | 🟡 Atencion      |       |
| 👥 Usuarios    |  | Owner: Ana       | | Owner: Luis      |       |
|                |  | 3 tareas abiertas| | 1 tarea abierta  |       |
|                |  | Hace 2 dias      | | Hace 5 dias      |       |
|                |  +------------------+ +------------------+       |
| ──────────── |  +------------------+ +------------------+       |
| 12/30 trans.   |  | Initech          | | Umbrella Ltd     |       |
| este mes       |  | 🟢 Al dia        | | ⚫ Sin actividad  |       |
| [========>  ]  |  | Owner: Ana       | | Owner: —         |       |
| Plan Starter   |  | 0 tareas abiertas| | 45 dias sin act. |       |
|                |  | Hace 1 dia       | |                  |       |
|                |  +------------------+ +------------------+       |
|                |                                                   |
|                |  Mostrando 4 de 8 cuentas                        |
+----------------+--------------------------------------------------+


=======================================================================
PAGE 2: Account Detail   /app/accounts/[accountId]
(scroll vertical — sections se muestran en orden)
=======================================================================

+------------------------------------------------------------------+
| [plani.fyi]    |  ← Volver al portfolio                         |
|----------------|--------------------------------------------------|
| (sidebar)      |                                                  |
|                |  ACME CORP                    [Editar] [Eliminar]|
|                |  Owner: Ana Lopez  🔴 Riesgo de churn            |
|                |  Ultima actualizacion AI: hace 2 horas           |
|                |                                                  |
|                |==================================================|
|                |  RESUMEN AI                                      |
|                |  +----------------------------------------------+|
|                |  | El cliente mostro señales de preocupacion     ||
|                |  | en la ultima reunion. La propuesta enviada    ||
|                |  | hace 3 semanas no tuvo respuesta. Se sugiere  ||
|                |  | un seguimiento urgente antes del cierre de   ||
|                |  | trimestre.                    [✏️ Editar]    ||
|                |  +----------------------------------------------+|
|                |  🔴 Riesgo: Sin respuesta a propuesta (hace 3s)  |
|                |                                                  |
|                |==================================================|
|                |  CONTACTOS DEL CLIENTE           [+ Agregar]    |
|                |  +----------------------------------------------+|
|                |  | 👤 Ana Lopez                                 ||
|                |  |    VP Marketing · ana@acme.com               ||
|                |  |    +54 11 5555-1234 · linkedin.com/in/ana    ||
|                |  |    [Editar] [Eliminar]                       ||
|                |  +----------------------------------------------+|
|                |  | 👤 Carlos Ruiz                               ||
|                |  |    CEO · carlos@acme.com                     ||
|                |  |    — · linkedin.com/in/carlos                ||
|                |  |    [Editar] [Eliminar]                       ||
|                |  +----------------------------------------------+|
|                |  | 👤 Juan Perez (sin confirmar)                ||
|                |  |    ? · —                                     ||
|                |  |    [Completar perfil] [Eliminar]             ||
|                |  +----------------------------------------------+|
|                |                                                  |
|                |==================================================|
|                |  SUBIR TRANSCRIPCION                             |
|                |  +----------------------------------------------+|
|                |  | [📄 Arrastra tu archivo .txt/.docx aqui]    ||
|                |  |           o                                  ||
|                |  | [📋 Pega el texto de la transcripcion...]   ||
|                |  |                                              ||
|                |  | 18/30 transcripciones restantes este mes    ||
|                |  |                   [Cancelar] [Procesar →]  ||
|                |  +----------------------------------------------+|
|                |  +----------------------------------------------+|
|                |  | 📝 Agregar nota o actualizacion manual       ||
|                |  | [Textarea...]                                ||
|                |  |                          [Guardar nota]     ||
|                |  +----------------------------------------------+|
|                |                                                  |
|                |  ~~~ visible solo cuando hay un job activo ~~~  |
|                |  +----------------------------------------------+|
|                |  | PROCESANDO...                                ||
|                |  | [================>              ] 45%       ||
|                |  | Extrayendo tareas y proximos pasos...        ||
|                |  | ✓ Texto procesado  ✓ Participantes          ||
|                |  | → Extrayendo tareas  ○ Resumen  ○ Señales   ||
|                |  +----------------------------------------------+|
|                |                                                  |
|                |==================================================|
|                |  PERSONAS Y REUNIONES                           |
|                |  [Todos ▼] [Contactos cliente] [Equipo interno] |
|                |                                                  |
|                |  Personas confirmadas en reuniones (6)          |
|                |  +----------------------------------------------+|
|                |  | ✓ Ana Lopez      5 reuniones  Ultima: 12/03 ||
|                |  | ✓ Carlos Ruiz    3 reuniones  Ultima: 12/03 ||
|                |  | ✓ Juan Perez     1 reunion    Ultima: 12/03 ||
|                |  | ✓ Maria (intern) 5 reuniones  Ultima: 12/03 ||
|                |  +----------------------------------------------+|
|                |                                                  |
|                |  Sugeridos en ultima transcripcion              |
|                |  [✓ confirmar: Ana] [✓ Carlos] [? Juan ×]      |
|                |  [+ Agregar participante manualmente]           |
|                |                                                  |
|                |==================================================|
|                |  TAREAS Y PROXIMOS PASOS             [+ Agregar]|
|                |  Filtro: [Pendientes ▼]                         |
|                |  ☐ Enviar propuesta actualizada (reunion 12/03) |
|                |  ☐ Agendar call de seguimiento — esta semana    |
|                |  ☑ Presentar informe Q1 ~~completada~~          |
|                |                                                  |
|                |==================================================|
|                |  RESULTADOS PAID MEDIA Y CRM      [Phase 2]     |
|                |  Periodo: [Ultimos 30 dias ▼]                   |
|                |                                                  |
|                |  Leads: 142   SQL (CRM): 38   Lead→SQL: 26.7%  |
|                |  Inversion: $4.200   CPL: $29.57   ROAS: 2.9x  |
|                |                                                  |
|                |  Por canal:                                      |
|                |  +----------------+----------+----------------+ |
|                |  | Google Ads     | Meta Ads | LinkedIn       | |
|                |  | $2.100         | $1.500   | $600           | |
|                |  | 80 leads       | 52 leads | 10 leads       | |
|                |  | CPL: $26.25    | $28.84   | $60            | |
|                |  | ROAS: 3.2x     | 2.8x     | 1.9x           | |
|                |  +----------------+----------+----------------+ |
|                |                                                  |
|                |  Creatividades activas: 8  [Ver campañas →]     |
|                |                                                  |
|                |  ~ Estado vacio (sin ad connections): ~         |
|                |  "Conecta tus cuentas publicitarias para ver    |
|                |   metricas de campanas aqui"  [Conectar]        |
|                |                                                  |
|                |==================================================|
|                |  SEÑALES DETECTADAS                             |
|                |  🔴 churn_risk: Sin respuesta a propuesta (12/03)|
|                |     [Marcar resuelta] [Editar] [Eliminar]       |
|                |  🟢 growth_opportunity: Expansion a nuevo mercado|
|                |     mencionada en reunion 5/03                  |
|                |     [Marcar resuelta] [Editar] [Eliminar]       |
|                |  [▸ Ver 2 señales resueltas]                    |
|                |                                                  |
|                |==================================================|
|                |  HISTORIAL DE PROCESAMIENTO                     |
|                |  +----------------------------------------------+|
|                |  | 📄 reunion-q1-review.txt  12/03 ✓ Procesado ||
|                |  | Participantes: Ana, Carlos, Juan             ||
|                |  | [Ver detalle →]          [🗑️ Eliminar]     ||
|                |  +----------------------------------------------+|
|                |  | 📝 Nota manual            08/03              ||
|                |  | "Cliente pidio pausa en nuevas propuestas"   ||
|                |  |                           [🗑️ Eliminar]     ||
|                |  +----------------------------------------------+|
|                |  | [Cargar mas resultados...]                   ||
|                |  +----------------------------------------------+|
+----------------+--------------------------------------------------+


=======================================================================
PAGE 3: Transcript Detail   /app/accounts/[accountId]/transcripts/[transcriptId]
=======================================================================

+------------------------------------------------------------------+
| [plani.fyi]    |  ← Volver a Acme Corp                          |
|----------------|--------------------------------------------------|
| (sidebar)      |  reunion-q1-review.txt                          |
|                |  Procesada: 12 Mar 2026   Participantes: 3      |
|                |                                                  |
|                |  RESUMEN DE ESTA REUNION                        |
|                |  +----------------------------------------------+|
|                |  | Reunion de revision Q1. El cliente expreso   ||
|                |  | preocupacion por los resultados de campana.  ||
|                |  | Se acordo enviar propuesta actualizada antes  ||
|                |  | del 20/03.                                   ||
|                |  +----------------------------------------------+|
|                |                                                  |
|                |  TAREAS EXTRAIDAS EN ESTA REUNION               |
|                |  ☐ Enviar propuesta actualizada antes del 20/03 |
|                |  ☐ Agendar call de seguimiento semana del 17    |
|                |                                                  |
|                |  PARTICIPANTES                                   |
|                |  ✓ Ana Lopez  ✓ Carlos Ruiz  ✓ Juan Perez      |
|                |                                                  |
|                |  SEÑALES DETECTADAS EN ESTA REUNION             |
|                |  🔴 churn_risk: Cliente expreso disconformidad  |
|                |     con resultados Q1                           |
|                |                                                  |
|                |  [▸ Ver transcripcion original]                 |
|                |                                                  |
|                |  [🗑️ Eliminar transcripcion]                    |
+----------------+--------------------------------------------------+


=======================================================================
PAGE 4: Campaign Detail   /app/accounts/[accountId]/campaigns
(Phase 2)
=======================================================================

+------------------------------------------------------------------+
| [plani.fyi]    |  ← Volver a Acme Corp                          |
|----------------|--------------------------------------------------|
| (sidebar)      |  Campanas de Adquisicion — ACME CORP            |
|                |  Periodo: [Ultimos 30 dias ▼]  [🔄 Sincronizar] |
|                |                                                  |
|                |  RESUMEN CONSOLIDADO                            |
|                |  Inversion: $4.200   Leads: 142   SQL: 38       |
|                |  CPL: $29.57   Lead→SQL: 26.7%   ROAS: 2.9x    |
|                |  Creatividades activas: 8                       |
|                |                                                  |
|                |  [Google Ads] [Meta Ads] [LinkedIn]  ← tabs     |
|                |                                                  |
|                |  === Google Ads ===                             |
|                |  Campanas activas: 2                            |
|                |  +----------------------------------------------+|
|                |  | Brand Search                                 ||
|                |  | Inversion: $1.200  Leads: 45  CPL: $26.67   ||
|                |  | CTR: 4.2%  ROAS: 3.8x  Conversiones: 45     ||
|                |  | 🟢 Activa  · 2 creatividades activas         ||
|                |  +----------------------------------------------+|
|                |  | Performance Max                              ||
|                |  | Inversion: $900   Leads: 35  CPL: $25.71    ||
|                |  | CTR: 2.1%  ROAS: 2.9x  Conversiones: 35     ||
|                |  | 🟢 Activa  · 4 creatividades activas         ||
|                |  +----------------------------------------------+|
|                |                                                  |
|                |  METRICAS CONFIGURABLES                         |
|                |  Columnas visibles:                             |
|                |  [☑ CPL] [☑ ROAS] [☑ Leads] [□ Impresiones]   |
|                |  [☑ CTR] [□ CPC]  [☑ Conv.] [□ CPM]  [Guardar]|
+----------------+--------------------------------------------------+


=======================================================================
PAGE 5: Profile   /app/profile
=======================================================================

+------------------------------------------------------------------+
| [plani.fyi]    |  Perfil                                         |
|----------------|--------------------------------------------------|
| (sidebar)      |  [👤] Ana Lopez                                  |
|                |  ana@agencia.com  [Cambiar contrasena]           |
|                |  [Eliminar cuenta]                               |
|                |                                                  |
|                |  SUSCRIPCION ACTUAL (desde Stripe)              |
|                |  Plan: Starter · $49/mes                        |
|                |  Proximo cobro: 1 May 2026                      |
|                |  Metodo de pago: Visa ···· 4242                 |
|                |  [Gestionar billing →] (Stripe Portal)          |
|                |                                                  |
|                |  USO ESTE MES                                   |
|                |  Transcripciones: 12 / 30                       |
|                |  [=================>              ] 40%         |
|                |  Cuentas activas: 8 / 10                        |
|                |  [===============================>  ] 80%       |
|                |                                                  |
|                |  TUS ESTADISTICAS                               |
|                |  Transcripciones procesadas (total): 247        |
|                |  Tareas extraidas por AI: 1.384                 |
|                |  Señales detectadas: 89  · Resueltas: 62        |
|                |  Cuenta mas activa: Acme Corp (34 transcripciones)|
|                |                                                  |
|                |  PLANES DISPONIBLES                             |
|                |  +-------------+ +-----------+ +-------------+  |
|                |  | Free        | | Starter   | | Pro         |  |
|                |  | $0/mes      | | $49/mes   | | $99/mes     |  |
|                |  | 2 cuentas   | | ⭐Popular  | | 30 cuentas  |  |
|                |  | 5 trans/mes | | 10 ctas   | | Ilimitado   |  |
|                |  |             | | 30 trans  | | 100k words  |  |
|                |  | [Tu plan]   | | [Tu plan] | | [Upgrade →] |  |
|                |  +-------------+ +-----------+ +-------------+  |
+----------------+--------------------------------------------------+


=======================================================================
PAGE 6: Landing Page   /
=======================================================================

+--------------------------------------------------+
| [plani.fyi]                   [Login] [Empezar]  |
|--------------------------------------------------|
|                                                  |
|  "Siempre sabes como esta cada cuenta"           |
|  "sin depender de la memoria del equipo"         |
|                                                  |
|  [Empreza gratis — procesa tu primera reunion]   |
|                                                  |
|--------------------------------------------------|
|  COMO FUNCIONA                                   |
|  1. Subis la transcripcion de la reunion         |
|  2. La AI extrae tareas, detecta riesgos         |
|  3. Tu equipo siempre sabe donde esta cada cuenta|
|--------------------------------------------------|
|  PRICING                                         |
|  [Free $0] [Starter $49/mes] [Pro $99/mes]       |
|--------------------------------------------------|
|  FAQ                                             |
|  [¿Que formatos acepta? ...]                     |
+--------------------------------------------------+
```

---

### Navigation Flow Map

```
/ (Landing)
  ├─ [Login]   → /auth/login  → /app/portfolio
  └─ [Empezar] → /auth/sign-up → /app/portfolio


/app/portfolio
  ├─ [+ Nueva cuenta] → /app/accounts/new → /app/accounts/[accountId]
  └─ [Click en cuenta] → /app/accounts/[accountId]


/app/accounts/[accountId]  (Account Detail — eje central)
  ├─ [Subir transcripcion] → Server Action → Trigger.dev job
  │       ↓ useRealtimeRun() streaming
  │   [Progreso en tiempo real: 5 stages]
  │       ↓ job completo
  │   [Cuenta actualizada: resumen, señales, tareas]
  │
  ├─ [Agregar nota manual] → Server Action → historial actualizado
  │
  ├─ [Confirmar participante] → Server Action → contacto guardado
  │
  ├─ [Ver detalle transcripcion] → /app/accounts/[accountId]/transcripts/[transcriptId]
  │       └─ [← Volver a cuenta]
  │
  ├─ [Ver campañas →] → /app/accounts/[accountId]/campaigns  (Phase 2)
  │       └─ [← Volver a cuenta]
  │
  └─ [← Volver al portfolio] → /app/portfolio


/app/profile
  ├─ [Gestionar billing] → Stripe Customer Portal (externa)
  └─ [Upgrade] → Stripe Checkout → /app/profile (con plan actualizado)


/admin/dashboard
  └─ [Usuarios] → /admin/users
```
