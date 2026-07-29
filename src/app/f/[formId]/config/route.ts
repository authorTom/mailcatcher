import { NextResponse, type NextRequest } from 'next/server';

import { issueFormToken } from '@/lib/crypto';
import { corsHeaders, getForm } from '@/lib/forms';
import { recordFormView } from '@/lib/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ formId: string }> };

export async function OPTIONS(request: NextRequest, { params }: Params) {
  const { formId } = await params;
  const form = getForm(formId);
  if (!form) return new NextResponse(null, { status: 404 });

  return new NextResponse(null, {
    status: 204,
    headers: { ...corsHeaders(form, request.headers.get('origin')), 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}

/**
 * Public configuration for the embed snippet: which hidden field is the trap,
 * what to say on success, and a freshly signed timing token.
 *
 * Never cached — the token is time-sensitive, and a cached one would defeat the
 * time trap it exists to power.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { formId } = await params;
  const form = getForm(formId);

  if (!form) {
    return NextResponse.json({ ok: false, error: 'form_not_found' }, { status: 404 });
  }

  const headers = {
    ...corsHeaders(form, request.headers.get('origin')),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
  };

  if (form.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'form_inactive' }, { status: 410, headers });
  }

  // Loading the config is the closest signal we have to "the form was seen",
  // which gives the conversion rate its denominator.
  recordFormView(form.id);

  return NextResponse.json(
    {
      ok: true,
      id: form.id,
      name: form.name,
      honeypot: form.settings.honeypotName,
      successMessage: form.settings.successMessage,
      redirectUrl: form.settings.redirectUrl,
      token: issueFormToken(),
      fields: form.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
    },
    { headers },
  );
}
