# Links individuales por búsqueda + búsquedas confidenciales (Selección) — Diseño

**Fecha:** 2026-06-18
**Estado:** Aprobado el enfoque y las 4 partes; pendiente revisión del spec por el usuario.

## Problema

Hoy en Selección hay **un solo link público por cuenta** (`account_share_links` →
`/c/[token]`) cuya sección "Selección" muestra **todas** las búsquedas `active` de
la cuenta (cuando `shareConfig.selection` está prendido). Falta:

1. Poder compartir **una búsqueda puntual** con un link propio (no toda la cuenta).
2. Marcar búsquedas como **confidenciales** para que NO aparezcan en el link
   general del cliente.

**Caso de uso:** una búsqueda de "repaso" (reemplazo de un líder) es confidencial.
Un stakeholder del lado del cliente que tiene el link general no debe ver que se
está buscando su reemplazo. Esa búsqueda se comparte solo por un link individual
con las personas que corresponden (RRHH, dirección).

## Decisiones tomadas (brainstorming)

- **Alcance de la confidencialidad: solo el link del cliente.** La agencia
  (miembros del workspace) sigue viendo TODAS las búsquedas dentro de la app. Una
  búsqueda confidencial solo desaparece del **portal público de cuenta**; se puede
  compartir por su link individual.
- **El link individual replica al de cuenta:** token único, contraseña opcional,
  activar/desactivar, contador de vistas. Muestra **solo esa búsqueda** (sus
  candidatos, ratings, informes) con la marca de la agencia y el mismo password
  gate + cookie que `/c/[token]`. Aplica a cualquier búsqueda, confidencial o no.

## Enfoque elegido

Tabla nueva `selection_search_share_links` (espejo de `account_share_links` pero
por `searchId`) + ruta pública nueva `/cs/[token]` + extender el resolver de token
de las acciones públicas de selección para aceptar ambos tipos de token. Reusa la
infra existente (password gate, cookie, branding, la `SelectionSection`
interactiva) sin ensuciar el link de cuenta.

**Alternativa descartada:** agregar `searchId` opcional a `account_share_links` y
que `/c/[token]` haga doble función. Menos tablas, pero mezcla dos conceptos y
complica la query del portal de cuenta y su `shareConfig`.

## Cambios concretos

### 1. Confidencialidad de la búsqueda

- Migración: `selection_searches.confidential boolean not null default false` (+ `down.sql`).
- `lib/queries/public-account.ts` → `loadSelectionForAccount`: agregar
  `eq(selectionSearches.confidential, false)` al filtro (hoy ya filtra
  `status = 'active'`). Así las confidenciales no salen en `/c/[token]`.
- UI interna: toggle "Confidencial" por búsqueda (en `search-list` y/o el form de
  edición de búsqueda) vía una server action `setSearchConfidential`.
- Indicador visual interno (badge "Confidencial") para que la agencia sepa cuáles
  no se muestran en el link general.

### 2. Tabla de links por búsqueda

`lib/drizzle/schema/selection_search_share_links.ts` (espejo de `account_share_links`):

```
id uuid pk
search_id uuid not null references selection_searches(id) on delete cascade
token text not null unique
password_hash text
password_version integer not null default 0
is_active boolean not null default true
view_count integer not null default 0
last_accessed_at timestamp
created_at / updated_at
index on (search_id)
```

Migración + `down.sql`. Una búsqueda tiene a lo sumo un link (como la cuenta).

### 3. Acciones internas (gestión del link) — `app/actions/selection.ts`

Espejo de las del `AccountShareSection` (ver `app/actions/share-links.ts`:
`createShareLink` / `setSharePassword` / `toggleShareLinkActive` /
`deleteShareLink`, y `account-share-section.tsx`), todas con
`requireAccountInWorkspace`:

- `createSearchShareLink(searchId)` → genera token, isActive=true. Idempotente:
  si ya existe, lo devuelve.
- `setSearchShareActive(searchId, isActive)`.
- `setSearchSharePassword(searchId, password | null)` → hashea (reusar
  `lib/share/password`); `password_version++` al cambiar (invalida cookies).
- `getSearchShareLink(searchId)` → estado actual para la UI.

### 4. Componente interno de compartir por búsqueda

`components/selection/search-share-section.tsx` — clon adaptado de
`account-share-section.tsx`: copia el link (`/cs/<token>`), toggle activo,
contraseña opcional, contador de vistas. Se monta en la vista de la búsqueda
(`candidate-workspace` / `search-list`), junto al toggle de confidencial.

### 5. Loader público de una búsqueda — `lib/queries/public-search.ts`

`getPublicSearchSnapshot(token)`:

- Busca el link por token. `not_found` / `inactive` según corresponda.
- Carga la búsqueda + workspace (nombre/logo, para la marca) + sus candidatos
  (reusar exactamente la forma de candidato de `loadSelectionForAccount` en
  `public-account.ts` — extraer esa proyección a un helper compartido para no
  duplicar la lista de campos del candidato).
- Devuelve `{ status, snapshot?, shareLinkId?, passwordHash?, passwordVersion? }`,
  con la misma forma que `SnapshotLookupResult` para reusar el password gate.
- Best-effort: incrementa `view_count` + `last_accessed_at`.
- NO respeta `confidential` (el link individual muestra la búsqueda aunque sea
  confidencial — ese es su propósito).

### 6. Ruta pública `/cs/[token]`

`app/(public)/cs/[token]/page.tsx` — clon de `/c/[token]/page.tsx`:

- Mismo flujo de password gate + cookie (reusar `lib/share/cookie`,
  `lib/share/password`; el `shareCookieName(token)` ya es por token, sirve igual).
- Renderiza la búsqueda con la marca de la agencia (reusar el header/branding de
  `public-account-view`) y la `SelectionSection` interactiva con la data de esa
  única búsqueda.

### 7. Acciones públicas del cliente — `app/actions/selection-client.ts`

Extender el resolver para aceptar el token de búsqueda:

- Renombrar/expandir `resolveTokenAccount` → `resolvePublicToken(token)` que
  devuelve `{ accountId, searchId | null } | null`:
  - Primero busca en `account_share_links` (activo + `shareConfig.selection`) →
    `{ accountId, searchId: null }`.
  - Si no, busca en `selection_search_share_links` (activo) → resuelve su
    `searchId` y el `accountId` de esa búsqueda → `{ accountId, searchId }`.
- `assertCandidateInAccount` → `assertCandidateVisible(candidateId, resolved)`:
  el candidato debe pertenecer al `accountId`; si hay `searchId`, además debe
  pertenecer a **esa** búsqueda. Así un token de búsqueda solo puede tocar
  candidatos de su búsqueda.
- `clientSetCandidateStatus`, `clientSaveCandidateFeedback`,
  `clientGetCandidateCvUrl` usan el nuevo resolver. La misma `SelectionSection`
  funciona en `/c` y `/cs` sin cambios de UI.

## Bordes que el spec cubre

- **Búsqueda confidencial sin link individual:** simplemente no la ve nadie del
  lado cliente (correcto). La agencia la ve en la app.
- **Link individual de una búsqueda no confidencial:** la búsqueda aparece tanto en
  el link general como en su link propio. Válido.
- **Contraseña:** `password_version` se bumpea al cambiarla, invalidando cookies
  viejas (igual que la cuenta).
- **Búsqueda cerrada/pausada:** el link individual la sigue mostrando si el link
  está activo (decisión: el dueño controla por `is_active`, no por el status de la
  búsqueda). El portal de cuenta sigue mostrando solo `active`.
- **Informe subido como archivo:** el visor público usa `reportContent` (texto);
  el candidato muestra su informe igual que en el portal de cuenta.

## Testing

- Compuerta: `npm run type-check` + `npm run build` (no hay framework de tests).
- Migraciones con su `down.sql`; dev y prod comparten base (la migración la corre
  el flujo habitual).
- E2E manual: crear búsqueda → marcar confidencial → verificar que desaparece del
  link general `/c/<token>` → generar su link individual `/cs/<token>` (con y sin
  contraseña) → verificar que muestra solo esa búsqueda y que puntuar/decisión/CV
  funcionan desde ese link.

## Archivos

- `lib/drizzle/schema/selection_searches.ts` — columna `confidential`.
- `lib/drizzle/schema/selection_search_share_links.ts` — **nuevo**.
- `drizzle/migrations/00XX_*` — `confidential` + tabla nueva (+ `down.sql`).
- `lib/queries/public-account.ts` — filtro `confidential=false` + extraer la
  proyección de candidato a un helper compartido.
- `lib/queries/public-search.ts` — **nuevo** (`getPublicSearchSnapshot`).
- `app/actions/selection.ts` — toggle confidencial + acciones del link de búsqueda.
- `app/actions/selection-client.ts` — resolver de token extendido.
- `app/(public)/cs/[token]/page.tsx` — **nuevo**.
- `components/selection/search-share-section.tsx` — **nuevo**.
- `components/selection/...` — toggle confidencial + badge en la lista/búsqueda.
