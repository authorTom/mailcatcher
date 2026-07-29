import { NextResponse, type NextRequest } from 'next/server';

import { corsHeaders, getForm, isOriginAllowed } from '@/lib/forms';
import { ingest } from '@/lib/ingest';
import { clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
// Ingest must never be cached or statically analysed — every request writes.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ formId: string }> };

/** True when the caller expects JSON rather than a redirect. */
function wantsJson(request: NextRequest, contentType: string): boolean {
  if (contentType.includes('application/json')) return true;
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('application/json') && !accept.includes('text/html')) return true;
  return request.headers.get('x-requested-with') === 'mailcatcher';
}

export async function OPTIONS(request: NextRequest, { params }: Params) {
  const { formId } = await params;
  const form = getForm(formId);
  if (!form) return new NextResponse(null, { status: 404 });

  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(form, request.headers.get('origin')),
  });
}

/** Visiting the endpoint in a browser is a common mistake — send them to the form. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { formId } = await params;
  const form = getForm(formId);
  if (!form) return new NextResponse('Form not found', { status: 404 });
  return NextResponse.redirect(new URL(`/form/${formId}`, _request.url), 302);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { formId } = await params;
  const contentType = request.headers.get('content-type') ?? '';
  const origin = request.headers.get('origin');
  const json = wantsJson(request, contentType);

  const form = getForm(formId);

  if (!form) {
    return respond(json, null, origin, { status: 404, code: 'form_not_found', message: 'Form not found.' });
  }
  if (form.status !== 'active') {
    return respond(json, form, origin, {
      status: 410,
      code: 'form_inactive',
      message: 'This form is no longer accepting submissions.',
    });
  }

  // Origin allowlist. Enforced only when an Origin header is present, so a
  // server-side POST or a curl test is never blocked by it.
  if (origin && !isOriginAllowed(form.settings.allowedOrigins ?? [], origin)) {
    return respond(json, form, origin, {
      status: 403,
      code: 'origin_not_allowed',
      message: 'This origin is not permitted to submit to this form.',
    });
  }

  /* --- Read the body ---------------------------------------------------- */
  let payload: Record<string, string>;
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
      payload = Object.fromEntries(
        Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)]),
      );
    } else {
      const formData = await request.formData();
      payload = {};
      for (const [key, value] of formData.entries()) {
        // Files are not stored — this is a contact catcher, not a file host.
        if (typeof value === 'string') payload[key] = value;
      }
    }
  } catch {
    return respond(json, form, origin, {
      status: 400,
      code: 'invalid_body',
      message: 'Could not read the submitted data.',
    });
  }

  /* --- Run the pipeline -------------------------------------------------- */
  const outcome = ingest({
    form,
    payload,
    ip: clientIp(request.headers),
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('cf-ipcountry') ?? request.headers.get('x-vercel-ip-country'),
    referrerHeader: request.headers.get('referer'),
  });

  if (outcome.kind === 'rejected') {
    return respond(json, form, origin, {
      status: outcome.status,
      code: outcome.code,
      message: outcome.message,
    });
  }

  // `trapped` deliberately falls through to the success path: a bot that gets an
  // error learns to adapt, whereas one that gets a 200 stops trying.
  return success(json, form, origin, request, payload);
}

/* ------------------------------------------------------------------ *
 * Responses
 * ------------------------------------------------------------------ */

function success(
  json: boolean,
  form: NonNullable<ReturnType<typeof getForm>>,
  origin: string | null,
  request: NextRequest,
  payload: Record<string, string>,
) {
  const headers = corsHeaders(form, origin);

  if (json) {
    return NextResponse.json(
      { ok: true, message: form.settings.successMessage },
      { status: 200, headers },
    );
  }

  // Classic form POST: 303 so the browser follows with GET and a refresh does
  // not resubmit.
  const target = resolveRedirect(form, payload._redirect, request);
  return NextResponse.redirect(target, { status: 303, headers });
}

function respond(
  json: boolean,
  form: ReturnType<typeof getForm> | null,
  origin: string | null,
  error: { status: number; code: string; message: string },
) {
  const headers = form ? corsHeaders(form, origin) : {};

  if (json) {
    return NextResponse.json(
      { ok: false, error: error.code, message: error.message },
      { status: error.status, headers },
    );
  }

  return new NextResponse(error.message, {
    status: error.status,
    headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Decide where to send the browser after a classic form POST.
 *
 * `settings.redirectUrl` is trusted — you configured it. The `_redirect` field
 * comes from the request, so it is only honoured when it points somewhere this
 * form already trusts: our own origin, the configured redirect target, or an
 * entry in the origin allowlist. Anything else and we would be running an open
 * redirect that could be used to lend credibility to a phishing link.
 */
function resolveRedirect(
  form: NonNullable<ReturnType<typeof getForm>>,
  requested: string | undefined,
  request: NextRequest,
): URL {
  const configured = form.settings.redirectUrl;
  const fallback = configured
    ? absoluteOrNull(configured, request) ?? new URL(`/form/${form.id}/thanks`, request.url)
    : new URL(`/form/${form.id}/thanks`, request.url);

  if (!requested) return fallback;

  const candidate = absoluteOrNull(requested, request);
  if (!candidate) return fallback;

  const self = new URL(request.url);
  if (candidate.origin === self.origin) return candidate;
  if (configured) {
    const configuredUrl = absoluteOrNull(configured, request);
    if (configuredUrl && candidate.origin === configuredUrl.origin) return candidate;
  }
  if (isOriginAllowed(form.settings.allowedOrigins ?? [], candidate.origin)) {
    // An empty allowlist makes isOriginAllowed permissive, which would defeat the
    // point here — require an explicit entry.
    if ((form.settings.allowedOrigins ?? []).length > 0) return candidate;
  }

  return fallback;
}

function absoluteOrNull(value: string, request: NextRequest): URL | null {
  try {
    const url = new URL(value, request.url);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
