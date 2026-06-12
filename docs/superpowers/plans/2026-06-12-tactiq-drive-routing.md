# Tactiq vía Drive + ruteo por contenido (#3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar las transcripciones de Tactiq (que cada usuario auto-guarda en su Google Drive) y rutearlas a la cuenta correcta por nombre de archivo o por contenido (nombre de la cuenta / dominio de email del cliente), reusando el Drive por-usuario ya construido.

**Architecture:** Sin integración/OAuth/schema nuevos. Se extrae la lógica de matching a un módulo puro (`lib/google/account-matching.ts`), se refactoriza el importador para exponer la extracción de texto y aceptar texto pre-cargado (evita doble descarga), y el cron de sync de carpeta personal hace un segundo paso de matching por contenido para los archivos cuyo nombre no matchea. Más una nota de onboarding de Tactiq en la UI de Integraciones.

**Tech Stack:** Next.js 15, Drizzle, Trigger.dev v3 (cron `sync-drive-folder`), Google Drive API (helpers existentes).

**Compuerta (no hay framework de test):** cada tarea cierra con `npm run type-check`; las de UI agregan `npm run build`. Verificación funcional = manual.

---

## Estructura de archivos
- Crear: `lib/google/account-matching.ts` — helpers puros de resolución de cuenta (nombre/contenido).
- Modificar: `lib/google/drive-import.ts` — exportar `extractDriveFileText` + opción `prefetchedText`.
- Modificar: `trigger/tasks/sync-drive-folder.ts` — usar el módulo de matching + segundo paso por contenido + guard link-only.
- Modificar: `app/(protected)/app/settings/integrations/page.tsx` — nota de onboarding Tactiq en la sección Drive.

---

### Task 1: Módulo puro de matching de cuenta

**Files:**
- Create: `lib/google/account-matching.ts`

- [ ] **Step 1: Crear el módulo**

```ts
/**
 * Resolución de "este archivo/transcripción pertenece a qué cuenta".
 * Lógica pura (sin DB, sin red) para poder razonarla y testearla aislada.
 * La usan el sync de Drive (filename + contenido) — incluido el flujo Tactiq.
 */

const ACCENT_MAP: Record<string, string> = {
  á: "a", à: "a", ä: "a", â: "a", ã: "a",
  é: "e", è: "e", ë: "e", ê: "e",
  í: "i", ì: "i", ï: "i", î: "i",
  ó: "o", ò: "o", ö: "o", ô: "o", õ: "o",
  ú: "u", ù: "u", ü: "u", û: "u",
  ñ: "n",
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => ACCENT_MAP[ch] ?? ch)
    .join("");
}

export interface AccountMatchOption {
  id: string;
  name: string;
  normalizedName: string;
  /** host del websiteUrl sin www, lowercased; null si la cuenta no tiene web. */
  domain: string | null;
}

/** Proveedores de email genéricos — nunca son señal de "cuenta cliente". */
const GENERIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

export function deriveDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export function resolveAccountByFilename(
  fileName: string,
  options: AccountMatchOption[]
): AccountMatchOption | null {
  const norm = normalize(fileName);
  const matches = options.filter((a) => a.normalizedName && norm.includes(a.normalizedName));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.normalizedName.length - a.normalizedName.length)[0];
}

export type ContentMatch =
  | { kind: "matched"; account: AccountMatchOption }
  | { kind: "ambiguous" }
  | { kind: "none" };

const EMAIL_RE = /[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi;

/**
 * Matchea por el cuerpo del transcript. Precedencia:
 *  1) dominio de email del cliente (señal fuerte) — si hay 1 cuenta, gana;
 *     si hay varias cuentas con dominios presentes → ambiguo.
 *  2) nombre de la cuenta en el texto — gana el normalizedName más largo;
 *     empate entre cuentas distintas en el largo máximo → ambiguo.
 */
export function resolveAccountByContent(
  text: string,
  options: AccountMatchOption[]
): ContentMatch {
  const lower = text.toLowerCase();

  const domainsInText = new Set<string>();
  for (const m of lower.matchAll(EMAIL_RE)) {
    const d = m[1].toLowerCase();
    if (!GENERIC_DOMAINS.has(d)) domainsInText.add(d);
  }
  const byDomainIds = new Map<string, AccountMatchOption>();
  for (const a of options) {
    if (a.domain && domainsInText.has(a.domain)) byDomainIds.set(a.id, a);
  }
  if (byDomainIds.size === 1) {
    return { kind: "matched", account: [...byDomainIds.values()][0] };
  }
  if (byDomainIds.size > 1) return { kind: "ambiguous" };

  const norm = normalize(text);
  const byName = options.filter((a) => a.normalizedName && norm.includes(a.normalizedName));
  if (byName.length === 0) return { kind: "none" };
  const sorted = [...byName].sort((a, b) => b.normalizedName.length - a.normalizedName.length);
  const top = sorted[0];
  const tieDifferent = sorted.filter(
    (a) => a.id !== top.id && a.normalizedName.length === top.normalizedName.length
  );
  if (tieDifferent.length > 0) return { kind: "ambiguous" };
  return { kind: "matched", account: top };
}
```

- [ ] **Step 2: type-check + commit**

Run: `npm run type-check`
Expected: PASS (módulo nuevo, sin consumidores aún).

```bash
git add lib/google/account-matching.ts
git commit -m "feat(drive): modulo puro de matching de cuenta (filename + contenido)"
```

---

### Task 2: Exportar extracción de texto + `prefetchedText` en el importador

**Files:**
- Modify: `lib/google/drive-import.ts`

- [ ] **Step 1: Exportar `extractDriveFileText`**

En `lib/google/drive-import.ts`, agregar (después de la función privada `extractTextFromBuffer`):

```ts
/**
 * Descarga un archivo de Drive y devuelve su texto plano (txt/md/csv/docx/pdf/
 * Google Doc). Devuelve null si no se pudo descargar o el tipo no es extraíble.
 * Lo usa el sync de Drive para matchear por contenido sin re-descargar luego.
 */
export async function extractDriveFileText(
  accessToken: string,
  file: DriveFileMeta
): Promise<string | null> {
  let downloaded: { data: ArrayBuffer; mimeType: string };
  try {
    downloaded = await downloadDriveFileAsArrayBuffer(accessToken, file.id, file.mimeType);
  } catch {
    return null;
  }
  return extractTextFromBuffer(downloaded.data, downloaded.mimeType, file.name);
}
```

- [ ] **Step 2: Agregar `prefetchedText` a `ImportOptions` y usarlo**

En la interfaz `ImportOptions`, agregar:
```ts
  /**
   * Texto ya extraído por el caller (sync por contenido). Cuando viene y el
   * archivo es transcript-shaped, evita re-descargar.
   */
  prefetchedText?: string | null;
```

Reemplazar el bloque que hoy descarga + extrae (las líneas desde `let downloaded ... = null;` hasta el cálculo de `const text = ...`) por:

```ts
  const usePrefetched =
    opts.prefetchedText != null && shape.isTranscriptShaped;

  let downloaded: { data: ArrayBuffer; mimeType: string } | null = null;
  let text: string | null;
  if (usePrefetched) {
    text = opts.prefetchedText ?? null;
  } else {
    try {
      downloaded = await downloadDriveFileAsArrayBuffer(
        accessToken,
        file.id,
        file.mimeType
      );
    } catch {
      return "skipped";
    }
    text = shape.isTranscriptShaped
      ? await extractTextFromBuffer(downloaded.data, downloaded.mimeType, file.name)
      : null;
  }
```

El bloque transcript-shaped (`if (shape.isTranscriptShaped && text && ...)`) queda igual (usa `text`).

Después de ese bloque, ANTES del path de context_document (que usa `downloaded.mimeType` / `downloaded.data`), agregar un guard:
```ts
  // Si usamos texto pre-cargado (sin descarga) y no entró por el path de
  // transcript, no tenemos bytes para armar el context_document → skip.
  // (Solo pasa con un archivo transcript-shaped de <10 palabras, no útil.)
  if (!downloaded) return "skipped";
```

(El resto del path de context_document queda igual, ahora con `downloaded` garantizado no-null.)

- [ ] **Step 3: type-check + commit**

Run: `npm run type-check`
Expected: PASS. (Los callers existentes no pasan `prefetchedText`, así que su comportamiento no cambia.)

```bash
git add lib/google/drive-import.ts
git commit -m "feat(drive): extractDriveFileText + prefetchedText (evita doble descarga)"
```

---

### Task 3: Two-pass matching en el cron de carpeta personal

**Files:**
- Modify: `trigger/tasks/sync-drive-folder.ts`

- [ ] **Step 1: Reemplazar el bloque de matching local por el módulo**

Leé el archivo. Borrá el `ACCENT_MAP`, la función `normalize`, la interfaz `AccountOption` y la función `matchAccountByFilename` locales (se reemplazan por el módulo). Agregá imports:

```ts
import {
  resolveAccountByFilename,
  resolveAccountByContent,
  deriveDomain,
  normalize,
  type AccountMatchOption,
} from "@/lib/google/account-matching";
import { importDriveFileForAccount, extractDriveFileText } from "@/lib/google/drive-import";
```
(Quitá el import viejo de `importDriveFileForAccount` si estaba en otra línea; debe quedar uno solo.)

- [ ] **Step 2: Incluir websiteUrl/domain en las opciones de cuenta**

Cambiar el select de cuentas para traer `websiteUrl` y construir `AccountMatchOption[]`:

```ts
      const workspaceAccounts = await db
        .select({ id: accounts.id, name: accounts.name, websiteUrl: accounts.websiteUrl })
        .from(accounts)
        .where(eq(accounts.workspaceId, connection.workspaceId));

      const accountOptions: AccountMatchOption[] = workspaceAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        normalizedName: normalize(a.name),
        domain: deriveDomain(a.websiteUrl),
      }));
```

- [ ] **Step 3: Loop con segundo paso por contenido**

Reemplazar el `for (const file of files) { ... }` por:

```ts
      for (const file of files) {
        // Paso 1: nombre de archivo (rápido, sin descarga).
        let matchedAccountId =
          resolveAccountByFilename(file.name, accountOptions)?.id ?? null;
        let prefetchedText: string | null = null;

        // Paso 2: contenido — solo si no matcheó por nombre y NO es link-only
        // (link-only justamente evita descargar).
        if (!matchedAccountId && !(connection.linkOnlySync ?? false)) {
          const text = await extractDriveFileText(accessToken, file);
          if (text) {
            const res = resolveAccountByContent(text, accountOptions);
            if (res.kind === "matched") {
              matchedAccountId = res.account.id;
              prefetchedText = text;
            } else if (res.kind === "ambiguous") {
              logger.info("Content match ambiguo — no se importa", {
                fileName: file.name,
              });
            }
          }
        }

        if (!matchedAccountId) {
          logger.info("Sin cuenta para el archivo — skip", { fileName: file.name });
          skipped += 1;
          continue;
        }

        const outcome = await importDriveFileForAccount({
          file,
          accessToken,
          workspaceId: connection.workspaceId,
          accountId: matchedAccountId,
          uploadedByUserId: connection.connectedByUserId,
          source: "drive_sync",
          linkOnly: connection.linkOnlySync ?? false,
          prefetchedText,
        });
        if (outcome === "imported") imported += 1;
        else skipped += 1;
      }
```

- [ ] **Step 4: type-check + commit**

Run: `npm run type-check`
Expected: PASS. (Si quedó `DriveFileMeta` importado y sin usar, dejá el `void` existente o quitá el import muerto según corresponda.)

```bash
git add trigger/tasks/sync-drive-folder.ts
git commit -m "feat(tactiq): ruteo por contenido en sync de Drive (nombre o dominio/nombre en el cuerpo)"
```

---

### Task 4: Nota de onboarding de Tactiq en Integraciones

**Files:**
- Modify: `app/(protected)/app/settings/integrations/page.tsx`

- [ ] **Step 1: Agregar la nota dentro de la sección Drive**

En la `<section>` de Drive de la página (la que renderiza los `DriveConnectionSection` / CTAs), agregar un bloque informativo (Server Component, JSX estático). Colocalo arriba de los CTAs de conexión:

```tsx
        <details className="mb-4 rounded-lg p-3 text-sm [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
          <summary className="cursor-pointer font-medium select-none">
            ¿Usás Tactiq para transcribir reuniones?
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              En Tactiq, activá el auto-guardado a Google Drive con tu cuenta de
              Google.
            </li>
            <li>
              Conectá esa misma cuenta acá como tu Drive personal y elegí la
              carpeta <strong>&ldquo;Tactiq Transcription&rdquo;</strong>.
            </li>
            <li>
              Cada nueva reunión se importa sola y se rutea a la cuenta del
              cliente por el nombre o el contenido del transcript.
            </li>
          </ol>
        </details>
```

(Adaptá el contenedor/clases al markup real de la sección Drive que encuentres; el objetivo es una nota plegable consistente con el estilo glass del resto.)

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Verificación manual**

`/app/settings/integrations` → sección Google Drive: aparece la nota plegable "¿Usás Tactiq…?" con los 3 pasos.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/app/settings/integrations/page.tsx"
git commit -m "feat(tactiq): nota de onboarding Tactiq en la seccion Drive de Integraciones"
```

---

## Cierre
- [ ] `npm run type-check && npm run build` en verde.
- [ ] Merge `feat/tactiq-drive-routing` a master + push. El cambio del cron (`sync-drive-folder.ts`) toca `trigger/tasks/*` → el deploy del worker se dispara con el push a master vía `trigger-deploy.yml`.
- [ ] Avisar al user qué probar: con un Drive personal conectado a una carpeta con Docs de Tactiq, que un Doc sin el nombre del cliente en el título pero con el nombre/dominio del cliente en el cuerpo rutee a la cuenta correcta; que uno ambiguo no se importe.

## Notas
- Sin migración ni cambios de schema.
- `linkOnlySync` desactiva el paso por contenido (coherente con "no descargar").
- El módulo de matching queda aislado y testeable si en el futuro se agrega un runner.
