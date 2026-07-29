'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

/** A copy-to-clipboard code block — every setup snippet is meant to be taken whole. */
export function CodeBlock({
  code,
  label,
  description,
  className,
}: {
  code: string;
  label?: string;
  description?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins — selecting the text still works.
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <p className="text-sm font-medium">{label}</p>}
      {description && <p className="text-xs text-muted">{description}</p>}

      <div className="group relative">
        {/* Right padding reserves room for the copy button so it never sits on
            top of the first line of code. */}
        <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-subtle p-3 pr-24 text-xs leading-relaxed">
          <code className="font-mono text-default">{code}</code>
        </pre>

        <button
          type="button"
          onClick={copy}
          className={cn(
            'absolute right-2 top-2 flex items-center gap-1 rounded-md border border-[var(--border)] bg-surface px-2 py-1',
            'text-[11px] font-medium text-muted transition-colors hover:text-default',
          )}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        >
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
