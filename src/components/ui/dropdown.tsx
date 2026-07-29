'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export const Dropdown = DropdownMenu.Root;
export const DropdownTrigger = DropdownMenu.Trigger;

export function DropdownContent({
  className,
  align = 'start',
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-[200px] overflow-hidden rounded-xl border border-[var(--border)] bg-surface p-1 shadow-lg',
          'max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function DropdownItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors',
        'data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        destructive ? 'text-danger' : 'text-default',
        className,
      )}
      {...props}
    />
  );
}

/** A checkable row — used for multi-select filters like tags and forms. */
export function DropdownCheckItem({
  checked,
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item> & { checked: boolean }) {
  return (
    <DropdownMenu.Item
      // Multi-select: keep the menu open so several can be picked in one go.
      onSelect={(event) => event.preventDefault()}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors',
        'data-[highlighted]:bg-surface-hover',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
          checked ? 'border-brand bg-brand text-brand-fg' : 'border-[var(--border-strong)]',
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DropdownMenu.Item>
  );
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn('px-2.5 py-1.5 text-xs font-medium text-subtle', className)} {...props} />;
}

export function DropdownSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />;
}
