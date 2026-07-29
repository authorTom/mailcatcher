import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

/**
 * Everything is private except the paths a landing page needs to reach — the
 * ingest endpoint, the embed script and the hosted forms — plus the health
 * probe the container healthcheck calls before any session exists.
 *
 * The export routes are deliberately absent: they verify the session themselves
 * as well, so contact data is never one proxy misconfiguration away from public.
 */
const PUBLIC_PREFIXES = ['/f/', '/form/', '/login', '/embed.js', '/api/health', '/_next/', '/favicon'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const authenticated = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (authenticated) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  // Send the user back where they were heading once they sign in.
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
