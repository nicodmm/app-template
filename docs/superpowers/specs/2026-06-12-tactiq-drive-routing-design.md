# Tactiq vía Drive + ruteo por contenido (#3)

**Fecha:** 2026-06-12
**Estado:** Diseño aprobado, pendiente de plan
**Feature:** #3 del batch — auto-import de transcripciones de Tactiq, ruteadas a la cuenta correcta.

## Investigación (resumen)

Tactiq **no tiene API pública** para que terceros bajen transcripciones. Las vías reales son:
- **Auto-save a Google Drive, por usuario:** cada persona conecta su cuenta de Google en Tactiq y las transcripciones se guardan como **Google Docs** en una carpeta **"Tactiq Transcription"** de su Drive.
- **Zapier** ("Meeting Transcript Is Ready" → webhook). Descartado: fricción por usuario + webhooks de Zapier son feature paga + campos no documentados.

Fuentes: help.tactiq.io (Google Drive, Zapier), tactiq.io/integrations, zapier.com/blog/automate-tactiq.

## Decisiones de producto (confirmadas)

1. **Vía = reusar el Drive por-usuario (#2).** No se construye integración nueva; cada usuario activa el auto-save de Tactiq→Drive y conecta esa cuenta/carpeta en la app. El cron existente importa.
2. **Ruteo = nombre + contenido.** Además del match por nombre de archivo (actual), se matchea por el contenido del transcript: nombre de la cuenta en el cuerpo, o email cuyo dominio coincide con el `websiteUrl` de la cuenta (señal de participante del cliente).

## Diseño

### Sin cambios de infraestructura
Sin nueva integración, OAuth, schema ni migración. Reusa `drive_connections` (personal), el cron `sync-all-drive-folders` → `sync-drive-folder`, y el importador `importDriveFileForAccount`.

### A. Ayuda de onboarding (UI)
En la sección Drive de la página de Integraciones, agregar una nota/acordeón corto "¿Usás Tactiq?" con los pasos:
1. En Tactiq, activá el auto-save a Google Drive con tu cuenta de Google.
2. Conectá esa misma cuenta acá como tu Drive personal y elegí la carpeta **"Tactiq Transcription"**.
3. Listo: cada nueva reunión se importa y se rutea sola a la cuenta del cliente.

Es copy/UI de bajo esfuerzo (un componente o un bloque dentro de `DriveConnectionSection`/la sección Drive de la page). No bloquea nada si no se usa.

### B. Matching con contenido (`trigger/tasks/sync-drive-folder.ts`)

El sync de carpeta personal hoy: lista archivos → `matchAccountByFilename(file.name, accounts)` → si matchea, importa; si no, saltea. Cambios:

1. **Pre-cálculo de opciones de cuenta:** además de `{ id, name, normalizedName }`, incluir el **dominio** derivado de `accounts.websiteUrl` (host sin `www.`, lowercased), cuando exista.

2. **Paso 1 — nombre (sin cambios):** `matchAccountByFilename`. Si matchea, importar como hoy.

3. **Paso 2 — contenido (para archivos sin match por nombre):**
   - Descargar + extraer el texto del archivo una sola vez (reusar la maquinaria del importador — ver punto D para evitar doble descarga).
   - Si la extracción falla o el texto es vacío → saltear (logueado).
   - Calcular candidatos:
     - **Por dominio (señal fuerte):** alguna cuenta cuyo `domain` aparezca como dominio de un email presente en el texto (regex de emails → set de dominios → match exacto contra `account.domain`).
     - **Por nombre:** alguna cuenta cuyo `normalizedName` esté incluido (normalizado) en el texto.
   - **Precedencia / desambiguación:**
     - Si hay match(es) por dominio: usar ese; si hay varios dominios distintos → ambiguo → saltear+loguear.
     - Si no hay dominio pero hay match(es) por nombre: usar el de `normalizedName` más largo; si hay empate entre nombres distintos → ambiguo → saltear+loguear.
     - Si no hay ninguno → saltear (logueado), igual que hoy.

4. Importar a la cuenta resuelta con `importDriveFileForAccount`, reusando el texto ya extraído.

### C. Helper de matching (testable, aislado)
Extraer la lógica de resolución de cuenta a una función pura en un módulo nuevo, p. ej. `lib/google/account-matching.ts`:
- `resolveAccountByFilename(fileName, options)` (mueve/equivale al `matchAccountByFilename` actual).
- `resolveAccountByContent(text, options)` → `{ accountId } | { ambiguous: true } | null`, implementando dominio>nombre y la desambiguación.
- `AccountMatchOption = { id; name; normalizedName; domain: string | null }` y `deriveDomain(url)`.
Esto deja la lógica fácil de razonar y reusar; `sync-drive-folder.ts` la consume.

### D. Evitar doble descarga
`importDriveFileForAccount` hoy descarga el archivo internamente. Para que el Paso 2 no descargue dos veces (una para matchear, otra para importar):
- Exportar desde `lib/google/drive-import.ts` un helper `extractDriveFileText(accessToken, file)` que haga download+extract y devuelva `string | null` (refactor: la lógica de extracción ya existe como `extractTextFromBuffer`, hoy privada).
- Agregar a `ImportOptions` un campo opcional `prefetchedText?: string | null`. Cuando viene, el importador usa ese texto en vez de volver a descargar (para el camino transcript-shaped). Si no viene, comportamiento actual.
- El Paso 2 del sync: `const text = await extractDriveFileText(token, file)` → matchear → `importDriveFileForAccount({ ..., prefetchedText: text })`.

(Si el refactor de `prefetchedText` resulta invasivo para el path de `context_document`, restringirlo al path transcript-shaped, que es el caso de Tactiq; los Docs de Tactiq son transcript-shaped.)

## Fuera de alcance
- Zapier / webhook receiver.
- Mapeo de contactos por cuenta más allá del `websiteUrl` existente.
- Selector de hojas / API de Tactiq.
- Sin migración ni cambios de schema.

## Riesgos / notas
- **Costo de descarga extra:** solo para archivos sin match por nombre. Una carpeta "Tactiq Transcription" típica tendrá títulos de meet variados; muchos no traerán el nombre del cliente, así que el Paso 2 correrá seguido — pero acotado por los caps por sync (24 primera vez, 100 incremental) y por el dedup (un archivo ya importado no se re-descarga). Un archivo que nunca matchea se re-evalúa cada sync; aceptable al volumen esperado. Se loguea el conteo de descargas-por-contenido por corrida.
- **Falsos positivos de nombre:** nombres de cuenta muy cortos/comunes podrían aparecer en cualquier texto. Mitigado por: dominio>nombre, "nombre más largo gana", y skip ante ambigüedad. (El match por nombre ya existe hoy con el mismo riesgo en el filename.)
- **Dominios genéricos:** ignorar dominios de proveedores comunes (gmail.com, outlook.com, hotmail.com, etc.) al construir el set de dominios candidatos, para no matchear por el email personal de un asistente interno.

## Criterio de aceptación
- Un Doc de Tactiq cuyo título NO tiene el nombre del cliente, pero cuyo cuerpo menciona el nombre de la cuenta o trae emails `@dominio-del-cliente`, se importa y se rutea a la cuenta correcta.
- Un Doc cuyo título sí tiene el nombre del cliente sigue ruteando por nombre (sin descarga extra).
- Ante ambigüedad (varias cuentas), no se importa y se loguea.
- La nota de onboarding de Tactiq aparece en la sección Drive de Integraciones.
- Sin doble descarga para los archivos ruteados por contenido.
- `npm run type-check` y `npm run build` en verde. (Si se agrega un helper de matching aislado y el repo tuviera runner de tests, tendría tests unitarios; hoy no hay runner, así que la verificación es type-check/build + manual.)
