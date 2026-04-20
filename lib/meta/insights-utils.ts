export type InsightAction = { action_type: string; value: string };

export function moneyToCents(s: string | undefined): number {
  if (!s) return 0;
  return Math.round(parseFloat(s) * 100);
}

export function intOrZero(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export function extractConversions(
  actions: InsightAction[] | undefined,
  event: string
): number {
  if (!actions) return 0;
  const match = actions.find((a) => a.action_type === event);
  return match ? intOrZero(match.value) : 0;
}

export function extractConversionValue(
  actionValues: InsightAction[] | undefined,
  event: string
): number | null {
  if (!actionValues) return null;
  const match = actionValues.find((a) => a.action_type === event);
  return match ? moneyToCents(match.value) : null;
}
