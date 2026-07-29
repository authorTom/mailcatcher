import * as React from 'react';

import { cn } from '@/lib/utils';

const base =
  'w-full rounded-lg border border-[var(--border)] bg-surface px-3 text-sm text-default ' +
  'placeholder:text-subtle transition-colors focus:border-brand focus:outline-none ' +
  'focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, 'py-2')} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, 'h-9 pr-8', className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-sm font-medium text-default', className)} {...props} />;
}
