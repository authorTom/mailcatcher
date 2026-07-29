import { X } from 'lucide-react';

import { tagColor } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Tag chip. The colour is decorative — the label always carries the meaning, so
 * a tag is never identified by colour alone.
 */
export function TagBadge({
  name,
  color,
  onRemove,
  className,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}) {
  const palette = tagColor(color);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: palette.bg }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: palette.dot }} aria-hidden="true" />
      <span className="truncate text-default">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 shrink-0 rounded p-0.5 text-subtle transition-colors hover:text-default"
          aria-label={`Remove tag ${name}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

export function StatusBadge({ status }: { status: 'subscribed' | 'unsubscribed' }) {
  const subscribed = status === 'subscribed';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium',
        subscribed ? 'text-success' : 'text-muted',
      )}
      style={{
        backgroundColor: subscribed
          ? 'color-mix(in oklab, var(--success) 14%, transparent)'
          : 'var(--bg-subtle)',
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: subscribed ? 'var(--success)' : 'var(--text-subtle)' }}
        aria-hidden="true"
      />
      {subscribed ? 'Subscribed' : 'Unsubscribed'}
    </span>
  );
}
