import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { cn, formatCompact } from '@/lib/utils';

/**
 * A stat tile is the right form when the answer is a single number — no plot,
 * no axis, no decoration competing with the figure.
 *
 * The value uses proportional figures (it stands alone); a delta is shown with
 * an arrow icon AND a signed percentage, so direction never rests on colour.
 */
export function StatTile({
  label,
  value,
  change,
  hint,
  /** Set when a rise is bad — spam blocked going up is not an improvement. */
  invertDelta = false,
}: {
  label: string;
  value: string | number;
  change?: number | null;
  hint?: string;
  invertDelta?: boolean;
}) {
  const display = typeof value === 'number' ? formatCompact(value) : value;

  return (
    <div className="card p-4 sm:p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{display}</p>

      <div className="mt-1.5 flex min-h-5 items-center gap-2">
        {change != null && <Delta change={change} invert={invertDelta} />}
        {hint && <span className="text-xs text-subtle">{hint}</span>}
      </div>
    </div>
  );
}

function Delta({ change, invert }: { change: number; invert: boolean }) {
  const flat = Math.abs(change) < 0.5;
  const rising = change > 0;
  const good = invert ? !rising : rising;

  const Icon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        flat ? 'text-subtle' : good ? 'text-success' : 'text-danger',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {/* The sign is spelled out so the meaning survives without colour. */}
      {flat ? 'No change' : `${rising ? '+' : ''}${change.toFixed(0)}%`}
    </span>
  );
}
