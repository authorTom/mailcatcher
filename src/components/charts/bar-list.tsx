import Link from 'next/link';

import { cn, formatNumber } from '@/lib/utils';

export type BarItem = {
  key: string;
  label: string;
  value: number;
  /** Optional secondary figure shown to the right of the count. */
  meta?: string;
  href?: string;
};

/**
 * Horizontal bar list, built in plain HTML rather than a chart library.
 *
 * Every row is directly labelled with its value, which is also the relief the
 * light-mode contrast warning on some categorical slots requires: the number is
 * readable regardless of whether the bar colour is distinguishable.
 */
export function BarList({
  items,
  colorVar = '--viz-1',
  emptyMessage = 'No data yet',
}: {
  items: BarItem[];
  colorVar?: string;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-subtle">{emptyMessage}</p>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const pct = (item.value / max) * 100;

        const row = (
          <div className="relative flex items-center gap-3 rounded-md px-2 py-2 transition-colors group-hover:bg-surface-hover">
            {/* The bar sits behind the label: a track, not a separate column. */}
            <div
              className="absolute inset-y-1 left-0 rounded-[4px] transition-[width]"
              style={{
                width: `${Math.max(pct, 2)}%`,
                backgroundColor: `var(${colorVar})`,
                opacity: 0.16,
              }}
              aria-hidden="true"
            />
            <span
              className="relative size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: `var(${colorVar})` }}
              aria-hidden="true"
            />
            <span className="relative min-w-0 flex-1 truncate text-sm text-default">{item.label}</span>
            {item.meta && <span className="relative tnum shrink-0 text-xs text-subtle">{item.meta}</span>}
            <span className="relative tnum shrink-0 text-sm font-semibold text-default">
              {formatNumber(item.value)}
            </span>
          </div>
        );

        return (
          <li key={item.key} className="group">
            {item.href ? (
              <Link href={item.href} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function BarListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className={cn('h-9 animate-pulse rounded-md bg-subtle')} />
      ))}
    </ul>
  );
}
