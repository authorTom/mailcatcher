import { asc, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/db';
import { contacts, forms, submissions } from '@/db/schema';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { csvStream, exportFilename } from '@/lib/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = [
  'submitted_at',
  'email',
  'name',
  'form',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'referrer',
  'landing_page',
  'country',
  'fields',
];

/** The raw event log — one row per submission, not per contact. */
export async function GET(request: NextRequest) {
  if (!(await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const rows = db
    .select({
      createdAt: submissions.createdAt,
      email: contacts.email,
      name: contacts.name,
      formName: forms.name,
      utmSource: submissions.utmSource,
      utmMedium: submissions.utmMedium,
      utmCampaign: submissions.utmCampaign,
      referrer: submissions.referrer,
      landingPageUrl: submissions.landingPageUrl,
      country: submissions.country,
      payload: submissions.payload,
    })
    .from(submissions)
    .innerJoin(contacts, eq(contacts.id, submissions.contactId))
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.isSpam, false))
    .orderBy(asc(submissions.createdAt))
    .all();

  function* generate(): Generator<unknown[]> {
    for (const row of rows) {
      const fields = Object.entries(row.payload ?? {})
        .filter(([key]) => !key.startsWith('_'))
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

      yield [
        new Date(row.createdAt).toISOString(),
        row.email,
        row.name,
        row.formName,
        row.utmSource,
        row.utmMedium,
        row.utmCampaign,
        row.referrer,
        row.landingPageUrl,
        row.country,
        fields,
      ];
    }
  }

  return new NextResponse(csvStream(HEADERS, generate()), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFilename('submissions')}"`,
      'cache-control': 'no-store',
    },
  });
}
