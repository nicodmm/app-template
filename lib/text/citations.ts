/**
 * Quita los marcadores de cita que el modelo a veces incrusta cuando usa la
 * herramienta de web_search (ej: `<cite index="3-1">texto</cite>`). Devuelve el
 * texto interno sin las etiquetas. Seguro para usar en cliente y servidor.
 *
 * Se aplica tanto al escribir (enriquecimiento) como al mostrar, para limpiar
 * datos viejos que ya quedaron guardados con las etiquetas.
 */
export function stripCitations<T extends string | null | undefined>(text: T): T {
  if (text == null) return text;
  const cleaned = text
    // Etiquetas <cite ...> y </cite> (abiertas, cerradas o auto-cerradas).
    .replace(/<\/?cite\b[^>]*>/gi, "")
    // Espacios sobrantes que quedan pegados a la puntuación tras quitar la etiqueta.
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return cleaned as T;
}
