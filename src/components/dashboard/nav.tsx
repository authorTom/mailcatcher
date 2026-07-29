'use client';

import { BarChart3, Inbox, Settings, Tags, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: BarChart3, exact: true },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/forms', label: 'Forms', icon: Inbox },
  { href: '/tags', label: 'Tags', icon: Tags },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-brand-subtle text-brand' : 'text-muted hover:bg-surface-hover hover:text-default',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand">
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden="true">
          <path
            d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
            stroke="var(--brand-fg)"
            strokeWidth="1.8"
          />
          <path d="m4 8 7.06 4.9a1.6 1.6 0 0 0 1.88 0L20 8" stroke="var(--brand-fg)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-tight">Mail Catcher</span>
    </Link>
  );
}
