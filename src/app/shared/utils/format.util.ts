/** Signed, rounded credit amount with a trailing "c" (e.g. "-1,234c"). */
export function formatCredits(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '-' : ''}${Math.abs(rounded).toLocaleString()}c`;
}

/** Rounded integer with locale grouping. */
export function formatCompact(value: number): string {
  return Math.round(value).toLocaleString();
}

/** Abbreviates thousands/millions as k/M; smaller values are rounded with locale grouping. */
export function formatCompactNum(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return Math.round(value).toLocaleString();
}
