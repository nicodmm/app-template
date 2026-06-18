/**
 * Sanitiza un nombre de archivo para usarlo como clave de Supabase Storage.
 * Supabase rechaza claves con acentos, espacios y varios símbolos (ej. "·"),
 * tirando "Invalid key". Esto deja solo [a-zA-Z0-9._-]. Usar SOLO para el path
 * de storage; el nombre original (con acentos) se guarda aparte para mostrar.
 */
export function sanitizeStorageName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // quitar diacríticos
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+/, "")
    .slice(0, 120);
  return cleaned || "archivo";
}
