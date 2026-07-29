/**
 * Blocked spam is attributed to this sentinel contact so `submissions.contact_id`
 * can stay NOT NULL. It must be excluded from every contact-facing query and
 * every export — it is bookkeeping, not a person.
 */
export const SPAM_SENTINEL_EMAIL = 'spam@mailcatcher.invalid';

export const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
] as const;

export type RangeValue = (typeof RANGE_OPTIONS)[number]['value'];

export function parseRange(value: string | undefined): RangeValue {
  return RANGE_OPTIONS.some((o) => o.value === value) ? (value as RangeValue) : '30';
}

/** Inclusive start of the range, or null for all time. */
export function rangeStart(range: RangeValue): Date | null {
  if (range === 'all') return null;
  const days = Number(range);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

export function rangeLabel(range: RangeValue): string {
  return RANGE_OPTIONS.find((o) => o.value === range)?.label ?? 'Last 30 days';
}

export const TAG_COLORS = [
  { name: 'slate', dot: '#64748b', bg: 'rgba(100,116,139,0.14)', text: '#475569', textDark: '#cbd5e1' },
  { name: 'red', dot: '#dc2626', bg: 'rgba(220,38,38,0.14)', text: '#b91c1c', textDark: '#fca5a5' },
  { name: 'amber', dot: '#d97706', bg: 'rgba(217,119,6,0.16)', text: '#b45309', textDark: '#fcd34d' },
  { name: 'green', dot: '#16a34a', bg: 'rgba(22,163,74,0.14)', text: '#15803d', textDark: '#86efac' },
  { name: 'blue', dot: '#2563eb', bg: 'rgba(37,99,235,0.14)', text: '#1d4ed8', textDark: '#93c5fd' },
  { name: 'violet', dot: '#7c3aed', bg: 'rgba(124,58,237,0.14)', text: '#6d28d9', textDark: '#c4b5fd' },
  { name: 'pink', dot: '#db2777', bg: 'rgba(219,39,119,0.14)', text: '#be185d', textDark: '#f9a8d4' },
] as const;

export type TagColor = (typeof TAG_COLORS)[number]['name'];

export function tagColor(name: string) {
  return TAG_COLORS.find((c) => c.name === name) ?? TAG_COLORS[0];
}
