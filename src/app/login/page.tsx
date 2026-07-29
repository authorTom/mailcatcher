import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Already signed in — no reason to show the form again.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) redirect(next ?? '/');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-subtle p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-brand">
            <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
              <path
                d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
                stroke="var(--brand-fg)"
                strokeWidth="1.8"
              />
              <path d="m4 8 7.06 4.9a1.6 1.6 0 0 0 1.88 0L20 8" stroke="var(--brand-fg)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Mail Catcher</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your dashboard</p>
        </div>

        <div className="card p-6">
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
