# Import de cuentas: soporte Excel (.xlsx) (#5)

**Fecha:** 2026-06-12
**Estado:** Diseño aprobado, pendiente de plan
**Feature:** #5 del batch — sumar Excel al import masivo de cuentas (que ya soporta CSV/TSV).

## Contexto

El import masivo de cuentas **ya existe** en `/app/accounts/import`:
- `components/csv-import-form.tsx`: pegar/subir archivo → textarea editable → "Importar".
- `app/actions/accounts-import.ts` (`importAccountsFromCsv`): valida, mapea headers con sinónimos, resuelve responsable por email→miembro, crea cuentas en bloque, devuelve `created` + warnings/rowErrors. Tope 1000 filas.
- `lib/csv-parser.ts` (`parseCsv`): RFC-4180, **auto-detecta coma vs tab** y **maneja comillas**.

El form hoy lee el archivo con `FileReader.readAsText`, que sirve para CSV/TSV/TXT pero **no para `.xlsx`** (formato binario). Ese es el único gap vs el pedido "excel y csv".

## Decisión de producto (confirmada)

**Parseo en el cliente.** Al seleccionar un `.xlsx`/`.xls`, se convierte a CSV en el navegador con SheetJS y se vuelca en el textarea existente. Reusa toda la pipeline (server action + parser) sin cambios, y mantiene el paso de **revisar/editar antes de importar**.

## Diseño

### Dependencia
- Agregar `xlsx` (SheetJS) a `package.json`.
- Se importa **dinámicamente** (`const XLSX = await import("xlsx")`) dentro del handler de archivo, así no entra al bundle inicial — solo se descarga cuando el usuario elige un Excel.

### `components/csv-import-form.tsx`
- `onFileChange` pasa a ser async/promesa y ramifica por tipo de archivo:
  - **Excel** (extensión `.xlsx`/`.xls`, o MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` / `application/vnd.ms-excel`):
    1. `FileReader.readAsArrayBuffer`.
    2. `const XLSX = await import("xlsx")`.
    3. `const wb = XLSX.read(data, { type: "array" })`.
    4. Primera hoja: `wb.SheetNames[0]`. Si no hay hojas → error amable, no pisar textarea.
    5. `const csv = XLSX.utils.sheet_to_csv(wb.Sheets[firstSheetName])`.
    6. `setCsv(csv)` y limpiar `result`.
  - **CSV/TSV/TXT**: comportamiento actual (`readAsText`).
- Estado de conversión: un flag `converting` para mostrar "Convirtiendo…" y deshabilitar mientras se procesa un Excel grande.
- Manejo de error de parseo (archivo corrupto / SheetJS lanza) → setear un `result` de error con mensaje claro ("No pudimos leer el Excel; probá exportarlo como CSV"), sin pisar el textarea.
- `accept` del `<input type="file">`: agregar `.xlsx,.xls` y los dos MIME de spreadsheet a la lista actual.

### Copy / textos
- Label del textarea y placeholder: mencionar Excel ("CSV, TSV o Excel").
- `app/(protected)/app/accounts/import/page.tsx`: H1 "Importar cuentas desde CSV" → "…desde CSV o Excel"; subtítulo acorde.
- `app/(protected)/app/portfolio/page.tsx`: botón "Importar CSV" → "Importar".
- El bloque de ayuda "Columnas soportadas" aclara que también acepta Excel (primera hoja, primera fila = cabeceras).

## Fuera de alcance
- Sin cambios en `importAccountsFromCsv`, `parseCsv`, ni el schema. Sin migración.
- Solo se procesa **la primera hoja** del workbook (no selector de hojas).
- No se resuelve el formato de fecha US automáticamente: el CSV convertido queda editable en el textarea (el usuario revisa) y el parser ya avisa por fila si una fecha es inválida. Documentado como caveat en la ayuda.

## Riesgos / notas
- **Fechas de Excel:** `sheet_to_csv` emite el valor *formateado* de la celda. Si el Excel muestra MM/DD/YYYY, puede no matchear los formatos aceptados (YYYY-MM-DD o DD/MM/YYYY) y generar un warning de fecha. Mitigado por la edición previa en el textarea.
- **Bundle:** el import dinámico evita sumar SheetJS al first load; verificar que el build no lo meta en el chunk inicial.
- **`xlsx` y CVEs:** instalar una versión mantenida de SheetJS. Como el parseo corre en el cliente sobre un archivo que el propio usuario elige (no contenido de terceros), la superficie de riesgo es baja.

## Criterio de aceptación
- Subir un `.xlsx` válido convierte su primera hoja a CSV en el textarea; al importar se crean las cuentas igual que con un CSV pegado (mismos warnings/errores por fila).
- Subir CSV/TSV sigue funcionando igual que antes.
- Un Excel vacío o corrupto muestra un error claro sin romper la página.
- `xlsx` no entra al bundle inicial (import dinámico).
- `npm run type-check` y `npm run build` en verde.
