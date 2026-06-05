// Paleta fija de colores para etiquetas. Client-safe.

export const LABEL_COLORS = [
  { key: "slate", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", dot: "bg-slate-400" },
  { key: "red", chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
  { key: "orange", chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500" },
  { key: "amber", chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  { key: "green", chip: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", dot: "bg-green-500" },
  { key: "teal", chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300", dot: "bg-teal-500" },
  { key: "blue", chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500" },
  { key: "indigo", chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", dot: "bg-indigo-500" },
  { key: "purple", chip: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500" },
  { key: "pink", chip: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300", dot: "bg-pink-500" },
] as const;

export type LabelColorKey = (typeof LABEL_COLORS)[number]["key"];

export const LABEL_COLOR_KEYS: LabelColorKey[] = LABEL_COLORS.map((c) => c.key);

const BY_KEY = new Map(LABEL_COLORS.map((c) => [c.key, c]));

export function isLabelColor(value: string): value is LabelColorKey {
  return BY_KEY.has(value as LabelColorKey);
}

export function labelChipClass(color: string): string {
  return (BY_KEY.get(color as LabelColorKey) ?? LABEL_COLORS[0]).chip;
}

export function labelDotClass(color: string): string {
  return (BY_KEY.get(color as LabelColorKey) ?? LABEL_COLORS[0]).dot;
}
