# Integraciones: ownership + visibilidad (Meta + Drive)

**Fecha:** 2026-06-12
**Estado:** Diseño aprobado, pendiente de plan
**Features cubiertas:** #1 (Meta por dueño + UI colapsable) y #2 (Drive por usuario + compartido opcional)

## Problema

Hoy todas las integraciones son **a nivel workspace**: cualquier miembro ve y gestiona las
conexiones de Meta de todos, ve **todos los ad accounts en un listado plano** (crece sin
límite), y cualquiera puede mapear o desconectar la integración de otro. Drive es **uno solo
por workspace** (índice único), bloqueado a owner/admin.

Se quiere que cada persona sea dueña de lo que conecta y solo eso vea/toque, con una
excepción de Drive compartido del workspace, y una UI que no liste todo de una.

## Decisiones de producto (confirmadas con el usuario)

1. **Alcance Meta:** la restricción aplica solo a la **gestión** de la integración
   (conectar/desconectar, listar ad accounts, mapearlos). Las **métricas/insights de Meta**
   dentro de la página de un cliente **siguen visibles para todos** los que tienen acceso a
   esa cuenta. No se tocan esas vistas.
2. **Quién ve todo:** únicamente el **Owner** del workspace (super-admin). Los **admin** se
   comportan como un member para integraciones (solo ven lo suyo). _Excepción:_ owner y admin
   pueden conectar/gestionar el Drive compartido.
3. **Drive:** por usuario + opción de **Drive compartido del workspace** (visible para todos).
4. **Matching de import (Drive personal):** el import sigue matcheando filename→cuenta contra
   **todas** las cuentas del workspace (comportamiento actual). Se puede acotar a "mis cuentas"
   más adelante junto con #6; por ahora se deja simple.

## Regla de visibilidad (común)

Ambas tablas (`meta_connections`, `drive_connections`) ya guardan `connectedByUserId` (el
**dueño**). Una conexión es visible/gestionable para un usuario `U` si:

- `connection.connectedByUserId == U` (es el dueño), **o**
- `U` es **owner** del workspace, **o**
- (solo Drive) `connection.scope == 'workspace'` → visible para todos; gestionable por
  owner/admin.

Esta regla se aplica en **dos capas**:
- **Queries de lectura:** filtran lo que se muestra.
- **Server actions de escritura:** revalidan autorización antes de mutar (defensa en
  profundidad — no confiar solo en que la UI ocultó el botón).

---

## Bloque A — Meta: ownership + UI colapsable

### A.1 Lectura / visibilidad

En `app/(protected)/app/settings/integrations/page.tsx`:

- Resolver si el usuario actual es **owner** (`getWorkspaceMember(workspace.id, userId)` →
  `role === 'owner'`).
- `meta_connections`: filtrar a `connectedByUserId == userId OR isOwner`.
- `meta_ad_accounts`: filtrar a los que cuelgan de una conexión visible
  (`connectionId IN (conexiones visibles)`). Como `meta_ad_accounts.connectionId` es notNull,
  el filtro es directo.
- CRM se deja **igual** (es por-cuenta, fuera de alcance de esta feature).

### A.2 Autorización en server actions

Agregar un guard reutilizable, p. ej. en `app/actions/meta-connections.ts`:

```
async function requireMetaConnectionAccess(connectionId): Promise<{ workspaceId, userId }>
```

que carga la conexión, valida que pertenezca al workspace del usuario y que
`connectedByUserId == userId || isOwner`, o lanza error.

Aplicar en:
- `disconnectMetaConnection(connectionId)`
- la acción de mapeo de ad account (resolver el `connectionId` desde el `adAccountId` y validar)
- el backfill (`BackfillButton` → su action), idem vía `adAccountId`.

Hoy estas acciones no validan ownership: cualquiera puede desconectar/mapear la Meta de otro.

### A.3 UI colapsable (elimina el listado plano)

Reemplazar la sección "Ad accounts disponibles" (lista plana) por **una card colapsable por
conexión de Meta**:

- Cada card muestra el header de la conexión (nombre de usuario de Meta, estado, expiración,
  botones Reconectar/Desconectar) y, **etiquetado para el owner**, "conectado por {nombre}".
- **Cerrada por defecto.** Al expandir, muestra los ad accounts de esa conexión, cada uno con
  su `AdAccountMappingForm` y `BackfillButton` (sin cambios internos).
- Un member ve solo su(s) card(s); el owner ve una por cada persona que conectó Meta.
- Nuevo componente cliente (p. ej. `components/meta-connection-card.tsx`) que encapsula el
  estado expandido/colapsado. La page sigue siendo Server Component y le pasa props
  serializables (incluyendo los ad accounts ya agrupados por conexión).

---

## Bloque B — Drive: por usuario + compartido opcional

### B.1 Schema (`lib/drizzle/schema/drive_connections.ts`)

- Agregar columna `scope text not null default 'personal'` con check
  `scope IN ('personal','workspace')`.
- **Reemplazar** el índice único `drive_connections_workspace_unique` (sobre `workspaceId`)
  por un único sobre **(`workspaceId`, `connectedByUserId`, `scope`)**. Así cada usuario tiene
  a lo sumo un Drive personal y owner/admin además uno compartido.
- Migración: `db:generate` + `down.sql` que revierte (drop columna, restaurar índice viejo).
  Sin backfill de datos (base vacía).

### B.2 Conexión (intención personal vs compartido)

- `app/api/auth/google/login` (o el handler que arma la URL OAuth): aceptar un parámetro de
  intención y codificarlo en el `state` de OAuth (junto con lo que ya lleve). Default
  `personal`. Solo owner/admin puede pedir `workspace`.
- `app/api/auth/google/callback/route.ts`: leer el `scope` del `state`, validar permiso
  (si `workspace`, exigir owner/admin), y hacer upsert de la conexión con
  `connectedByUserId = userId` y el `scope` correspondiente. La clave de upsert pasa de
  `workspaceId` a (`workspaceId`, `connectedByUserId`, `scope`).

### B.3 Lectura / visibilidad

- Reemplazar `getDriveConnectionForWorkspace(workspaceId)` (devuelve una) por
  `getVisibleDriveConnections(workspaceId, userId, isOwner)` que devuelve la lista visible
  según la regla: personales propias + todas las `scope='workspace'` + (si owner) todas.

### B.4 Acciones (`app/actions/drive.ts`)

Hoy operan sobre "la conexión del workspace" implícita. Pasan a operar **por `connectionId`
explícito** con guard de autorización (dueño u owner; las `workspace` además gestionables por
admin):
- `setDriveFolder(connectionId, folderId, folderName)`
- `setDriveLinkOnlySync(connectionId, value)`
- `disconnectDrive(connectionId)`
- `syncDriveNow(connectionId)`
- `listDriveFoldersForConnection(connectionId, query?)`

### B.5 Dónde se gestiona (UX)

- Mover la gestión de Drive desde Ajustes→Workspace (hoy gateada a owner/admin) a la página de
  **Integraciones**, visible para **todos los miembros**.
- Cada usuario ve: su Drive personal (conectar si no tiene) + los Drives compartidos + (owner)
  todos. El botón "Conectar Drive compartido del workspace" aparece solo para owner/admin.
- `WorkspaceDriveSection` se generaliza a `DriveConnectionSection` que recibe **una** conexión
  (o el estado "no conectado" para ofrecer conectar). La página de Integraciones renderiza
  una por conexión visible + el/los CTA de conexión.

### B.6 Cron (sin cambios funcionales)

`syncAllDriveFolders` ya itera sobre **todas** las conexiones con `status='connected'` y
dispara `syncDriveFolder` por cada una; `importDriveFileForAccount` ya atribuye
`uploadedByUserId = connection.connectedByUserId`. Multi-Drive funciona tal cual. Verificar que
el matching siga usando `connection.workspaceId` para listar cuentas candidatas (sí lo hace).

---

## Fuera de alcance

- CRM (sigue por-cuenta, sin cambios).
- Métricas de Meta en páginas de cliente (siguen visibles para todos con acceso a la cuenta).
- Acotar el matching de import a "mis cuentas" (se evaluará con #6).

## Riesgos / cosas a verificar

- El `state` de OAuth de Google: confirmar qué lleva hoy para no pisarlo al agregar `scope`.
- Asegurar que ningún otro lugar del código llame a `getDriveConnectionForWorkspace`
  asumiendo "una sola" (grep: hoy solo `lib/queries/drive.ts` la expone; revisar usos).
- El gate `canManage` de `WorkspaceDriveSection` se elimina al mover a Integraciones; confirmar
  que no quede Drive huérfano en la pantalla de Workspace.

## Criterio de aceptación

- Un member que conecta Meta solo ve su conexión y sus ad accounts; no ve ni puede desconectar
  la de otro. El owner ve las de todos.
- Los ad accounts ya no se listan planos: van dentro de cards colapsables por conexión,
  cerradas por defecto.
- Dos usuarios distintos pueden tener cada uno su Drive personal; cada uno ve solo el suyo. Un
  owner/admin puede conectar un Drive compartido visible para todos.
- El cron importa transcripciones desde todos los Drives conectados, atribuidas a su dueño.
