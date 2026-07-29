import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { forms, type Form } from '@/db/schema';

export function getForm(formId: string): Form | undefined {
  return db.select().from(forms).where(eq(forms.id, formId)).get();
}

export function getFormBySlug(slug: string): Form | undefined {
  return db.select().from(forms).where(eq(forms.slug, slug)).get();
}

export function listForms(): Form[] {
  return db.select().from(forms).orderBy(forms.createdAt).all();
}

/**
 * CORS for the ingest endpoint.
 *
 * An empty `allowedOrigins` means "any origin" — the sane default, since a form
 * endpoint is public by nature and the honeypot/rate limiting do the real work.
 * Once you list origins, anything else is refused.
 */
export function corsHeaders(form: Form, requestOrigin: string | null): Record<string, string> {
  const allowed = form.settings.allowedOrigins ?? [];

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // X-Requested-With is sent by the embed snippet to ask for a JSON response.
    // It must be listed here or the browser fails the preflight and the fetch
    // never happens — which looks like a network outage to the visitor.
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (allowed.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else if (requestOrigin && isOriginAllowed(allowed, requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
  }

  return headers;
}

export function isOriginAllowed(allowed: string[], origin: string): boolean {
  if (allowed.length === 0) return true;

  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }

  return allowed.some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) return false;

    // Accept a bare hostname or a full URL in the allowlist — people paste both.
    let candidate = pattern;
    try {
      if (pattern.includes('://')) candidate = new URL(pattern).host;
    } catch {
      /* fall through to string comparison */
    }

    // `*.example.com` covers any subdomain but not the apex.
    if (candidate.startsWith('*.')) return host.endsWith(candidate.slice(1));
    return host === candidate;
  });
}
