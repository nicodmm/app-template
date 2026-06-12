# Import de cuentas: soporte Excel (#5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir cuentas desde un archivo Excel (.xlsx/.xls) además de CSV/TSV, convirtiéndolo a CSV en el cliente y reusando toda la pipeline de import existente.

**Architecture:** Parseo client-side. Al elegir un Excel, el form lo lee como ArrayBuffer, lo convierte a CSV con SheetJS (import dinámico) y lo vuelca en el textarea editable que ya existe; el server action y el parser no cambian.

**Tech Stack:** Next.js 15 (client component), SheetJS (`xlsx`), Tailwind.

**Compuerta (no hay framework de test):** cada tarea cierra con `npm run type-check`; la tarea de UI agrega `npm run build`. Verificación funcional = manual con un .xlsx real.

---

## Estructura de archivos
- Modificar: `package.json` — dependencia `xlsx` (SheetJS).
- Modificar: `components/csv-import-form.tsx` — rama Excel en `onFileChange` + estado `converting` + `accept` + copy.
- Modificar: `app/(protected)/app/accounts/import/page.tsx` — copy (H1/subtítulo).
- Modificar: `app/(protected)/app/portfolio/page.tsx` — label del botón "Importar CSV" → "Importar".

---

### Task 1: Dependencia SheetJS + conversión Excel→CSV en el form

**Files:**
- Modify: `package.json` (vía `npm install`)
- Modify: `components/csv-import-form.tsx`

- [ ] **Step 1: Instalar SheetJS**

Instalar desde el CDN oficial de SheetJS (la versión del registry npm, 0.18.5, arrastra CVE-2023-30533; la del CDN está parcheada):

Run: `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
Expected: agrega `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` a `package.json` y actualiza el lockfile, sin errores.
(Si el CDN no está accesible en el entorno, como fallback: `npm install xlsx@0.18.5` y dejar anotado en el commit que conviene migrar al build del CDN; pero intentá el CDN primero.)

- [ ] **Step 2: Reemplazar `onFileChange` y agregar el estado `converting` en `components/csv-import-form.tsx`**

Leé el archivo primero. Agregá el estado junto a los otros `useState`:
```ts
  const [converting, setConverting] = useState(false);
```

Agregá estas constantes a nivel de módulo (arriba del componente, cerca de `EXAMPLE_CSV`):
```ts
const EXCEL_EXT = /\.(xlsx|xls)$/i;
const EXCEL_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
```

Reemplazá la función `onFileChange` por:
```ts
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Permite re-seleccionar el mismo archivo más tarde.
    e.target.value = "";
    if (!file) return;

    const isExcel = EXCEL_EXT.test(file.name) || EXCEL_MIME.has(file.type);

    if (!isExcel) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        setCsv(text);
        setResult(null);
      };
      reader.readAsText(file);
      return;
    }

    // Excel: convertir la primera hoja a CSV en el cliente.
    setConverting(true);
    setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = reader.result;
        if (!(data instanceof ArrayBuffer)) throw new Error("read_failed");
        const XLSX = await import("xlsx");
        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) throw new Error("empty_workbook");
        const csvText = XLSX.utils.sheet_to_csv(wb.Sheets[firstSheet]);
        setCsv(csvText);
        setResult(null);
      } catch {
        setResult({
          success: false,
          error:
            "No pudimos leer el Excel. Probá exportarlo como CSV e intentá de nuevo.",
        });
      } finally {
        setConverting(false);
      }
    };
    reader.onerror = () => {
      setConverting(false);
      setResult({ success: false, error: "No se pudo leer el archivo." });
    };
    reader.readAsArrayBuffer(file);
  }
```

- [ ] **Step 3: Reflejar `converting` en la UI**

En el `accept` del `<input type="file">`, agregar Excel:
```tsx
            accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
```

En el botón "Cargar archivo", reflejar el estado:
```tsx
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={converting}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
          >
            <Upload size={13} aria-hidden />
            {converting ? "Convirtiendo…" : "Cargar archivo"}
          </button>
```

En el botón submit, agregar `converting` a `disabled`:
```tsx
          disabled={!csv.trim() || pending || converting}
```

Actualizar el label del textarea y el placeholder para mencionar Excel:
```tsx
          <label htmlFor="csv-textarea" className="text-sm font-medium">
            CSV / TSV / Excel
          </label>
```
```tsx
          placeholder="Pegá tu CSV/TSV, o subí un archivo CSV o Excel (.xlsx). Primera fila = cabeceras."
```

En el bloque de ayuda "Columnas soportadas", agregar una línea al final del `<p>` introductorio o como nota:
```tsx
        <p className="text-xs text-muted-foreground mt-2">
          También podés subir un Excel (.xlsx): tomamos la primera hoja y la
          convertimos a CSV en el textarea para que la revises antes de importar.
        </p>
```

- [ ] **Step 4: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Verificar en la salida del build que `xlsx` NO esté en el First Load JS de `/app/accounts/import` (debe aparecer como chunk lazy por el import dinámico). Si el build mete xlsx en el chunk inicial, confirmá que el `import("xlsx")` esté dentro del handler (no en el top-level del módulo).

- [ ] **Step 5: Verificación manual**

`npm run dev` → `/app/accounts/import`:
- Subí un `.xlsx` con cabeceras (name,email,fee,…) → el textarea se llena con el CSV convertido; "Importar" crea las cuentas con los mismos warnings/errores que un CSV.
- Subí un CSV/TSV → funciona igual que antes.
- Subí un archivo no-Excel renombrado a .xlsx o un Excel vacío → mensaje de error claro, sin romper la página.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/csv-import-form.tsx
git commit -m "feat(import): soporte Excel (.xlsx) en import de cuentas via SheetJS client-side"
```

---

### Task 2: Copy en página de import y botón del portfolio

**Files:**
- Modify: `app/(protected)/app/accounts/import/page.tsx`
- Modify: `app/(protected)/app/portfolio/page.tsx`

- [ ] **Step 1: Página de import**

En `app/(protected)/app/accounts/import/page.tsx`, actualizar el H1 y el subtítulo:
```tsx
      <h1 className="text-2xl font-semibold mb-1">Importar cuentas desde CSV o Excel</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Pegá un CSV (o subí un archivo CSV o Excel) con tus cuentas. Las creamos
        en bloque y después podés enriquecerlas individualmente con la web del
        cliente.
      </p>
```

- [ ] **Step 2: Botón del portfolio**

En `app/(protected)/app/portfolio/page.tsx`, cambiar el texto del link "Importar CSV" a "Importar":
```tsx
            <Upload size={15} />
            Importar
```
(El `href="/app/accounts/import"` y el resto quedan igual.)

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/app/accounts/import/page.tsx" "app/(protected)/app/portfolio/page.tsx"
git commit -m "feat(import): copy menciona Excel en pagina de import y boton del portfolio"
```

---

## Cierre
- [ ] `npm run type-check && npm run build` en verde.
- [ ] Merge `feat/import-excel` a master + push. Avisar al user qué probar (subir un .xlsx real). Sin migración ni deploy de Trigger.

## Notas
- Solo se procesa la primera hoja del workbook.
- Caveat de fechas US documentado en el spec (editable en el textarea antes de importar).
- Sin cambios en `importAccountsFromCsv` ni `parseCsv`.
