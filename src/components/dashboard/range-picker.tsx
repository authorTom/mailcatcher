'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { RANGE_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';

/** Date-range presets. Filters sit in one row above the charts. */
export function RangePicker({ value }: { value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(next: string) {
    const query = new URLSearchParams(params.toString());
    if (next === '30') query.delete('range');
    else query.set('range', next);

    startTransition(() => {
      router.push(query.size ? `?${query}` : '?', { scroll: false });
    });
  }

  return (
    <div
      role="group"
      aria-label="Date range"
      className={cn(
        'inline-flex rounded-lg border border-[var(--border)] bg-surface p-0.5',
        pending && 'opacity-70',
      )}
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={active}
            className={cn(
              'rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors',
              active ? 'bg-brand-subtle text-brand' : 'text-muted hover:text-default',
            )}
          >
            {option.label.replace('Last ', '').replace(' days', 'd')}
          </button>
        );
      })}
    </div>
  );
}
