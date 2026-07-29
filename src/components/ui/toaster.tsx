'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'card !bg-[var(--surface)] !text-[var(--text)] !border-[var(--border)]',
          description: '!text-[var(--text-muted)]',
          actionButton: '!bg-[var(--brand)] !text-[var(--brand-fg)]',
        },
      }}
    />
  );
}

export { toast } from 'sonner';
