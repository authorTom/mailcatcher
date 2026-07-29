'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { checkPassword, isPasswordConfigured } from '@/lib/password';
import { checkRateLimit, clientIp, recordRateHit } from '@/lib/rate-limit';
import { hashIp } from '@/lib/crypto';

export type LoginState = { error?: string };

/** Brute-force guard: 10 attempts per hour from one address. */
const LOGIN_RULE = { limit: 10, windowMs: 60 * 60 * 1000 };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '') || '/';

  if (!isPasswordConfigured()) {
    return { error: 'No admin password is configured on the server. See the README to set one.' };
  }
  if (!password) {
    return { error: 'Enter your password.' };
  }

  const key = `login:${hashIp(clientIp(await headers()))}`;
  if (!checkRateLimit(key, LOGIN_RULE)) {
    return { error: 'Too many attempts. Try again later.' };
  }
  recordRateHit(key);

  let ok: boolean;
  try {
    ok = await checkPassword(password);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not verify the password.' };
  }

  if (!ok) return { error: 'Incorrect password.' };

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);

  // Only ever return to a path on this app, never an absolute URL.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
