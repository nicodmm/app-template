// Modelo de columnas del Kanban. Client-safe (sin imports de servidor):
// se usa tanto en RSC como en componentes cliente.

export const TAREA_COLUMNS = [
  { key: "auto", label: "Automáticas de Meets" },
  { key: "backlog", label: "Backlog" },
  { key: "evaluacion", label: "Evaluación" },
  { key: "en_proceso", label: "En proceso" },
  { key: "por_aprobar", label: "Por Aprobar" },
  { key: "listas", label: "Listas" },
] as const;

export type TareaColumnKey = (typeof TAREA_COLUMNS)[number]["key"];

export const TAREA_COLUMN_KEYS: TareaColumnKey[] = TAREA_COLUMNS.map(
  (c) => c.key
);

const COLUMN_LABEL: Record<TareaColumnKey, string> = TAREA_COLUMNS.reduce(
  (acc, c) => {
    acc[c.key] = c.label;
    return acc;
  },
  {} as Record<TareaColumnKey, string>
);

export function columnLabel(key: TareaColumnKey): string {
  return COLUMN_LABEL[key];
}

/**
 * Normaliza el `status` crudo de la DB a una columna del board. Mapea los
 * valores legacy (`pending`/`completed`) a las columnas nuevas para que el
 * tablero funcione aun con datos sin migrar. Cualquier valor desconocido cae
 * en `backlog`.
 */
export function normalizeColumn(status: string): TareaColumnKey {
  if ((TAREA_COLUMN_KEYS as string[]).includes(status)) {
    return status as TareaColumnKey;
  }
  if (status === "completed") return "listas";
  // 'pending', 'in_progress' y cualquier otro → backlog
  return "backlog";
}

/** Una tarea está terminada cuando vive en la columna `listas`. */
export function isDoneColumn(key: TareaColumnKey): boolean {
  return key === "listas";
}

/**
 * Config de prioridad (label + clases Tailwind). Centralizado acá para que la
 * tarjeta y el drawer lo compartan sin depender del viejo `tasks-panel.tsx`
 * (que se elimina en esta misma fase). Es el mismo objeto que usaba el panel.
 */
export const PRIORITY_CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: "Crítica", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  2: { label: "Alta", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  3: { label: "Media", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  4: { label: "Baja", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  5: { label: "Mínima", className: "bg-muted text-muted-foreground" },
};
