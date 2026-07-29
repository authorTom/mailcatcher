import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/db';
import { contactTags, contacts, forms, tags } from '@/db/schema';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { SPAM_SENTINEL_EMAIL } from '@/lib/constants';
import { csvStream, exportFilename } from '@/lib/csv';
import { allMatchingIds, type ContactFilters } from '@/lib/queries/contacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = [
  'email',
  'name',
  'phone',
  'company',
  'status',
  'tags',
  'submissions',
  'source_form',
  'first_seen',
  'last_seen',
  'notes',
  'custom_fields',
];

export async function GET(request: NextRequest) {
  // The export route sits outside the page tree, so it re-checks the session
  // itself rather than relying on the proxy alone.
  if (!(await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  // An explicit id list wins (the "export selected" path); otherwise the export
  // reproduces exactly what the filters currently show.
  const explicitIds = params.getAll('id');
  const ids = explicitIds.length
    ? explicitIds
    : allMatchingIds({
        search: params.get('q') ?? undefined,
        tagIds: params.getAll('tag'),
        formIds: params.getAll('form'),
        status: (params.get('status') as ContactFilters['status']) ?? undefined,
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
      });

  if (ids.length === 0) {
    return new NextResponse('﻿' + HEADERS.join(',') + '\r\n', {
      headers: csvHeaders(exportFilename('contacts')),
    });
  }

  const rows = db
    .select({
      id: contacts.id,
      email: contacts.email,
      name: contacts.name,
      phone: contacts.phone,
      company: contacts.company,
      status: contacts.status,
      data: contacts.data,
      notes: contacts.notes,
      submissionCount: contacts.submissionCount,
      firstSeenAt: contacts.firstSeenAt,
      lastSeenAt: contacts.lastSeenAt,
      formName: forms.name,
    })
    .from(contacts)
    .leftJoin(forms, eq(forms.id, contacts.firstFormId))
    .where(and(inArray(contacts.id, ids), ne(contacts.email, SPAM_SENTINEL_EMAIL)))
    .orderBy(asc(contacts.email))
    .all();

  // Tags in one query, joined into a single column rather than N lookups.
  const tagRows = db
    .select({ contactId: contactTags.contactId, name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(inArray(contactTags.contactId, ids))
    .all();

  const tagsByContact = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByContact.get(row.contactId) ?? [];
    list.push(row.name);
    tagsByContact.set(row.contactId, list);
  }

  function* generate(): Generator<unknown[]> {
    for (const row of rows) {
      const custom = Object.entries(row.data ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

      yield [
        row.email,
        row.name,
        row.phone,
        row.company,
        row.status,
        (tagsByContact.get(row.id) ?? []).join('; '),
        row.submissionCount,
        row.formName,
        new Date(row.firstSeenAt).toISOString(),
        new Date(row.lastSeenAt).toISOString(),
        row.notes,
        custom,
      ];
    }
  }

  return new NextResponse(csvStream(HEADERS, generate()), {
    headers: csvHeaders(exportFilename('contacts')),
  });
}

function csvHeaders(filename: string) {
  return {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
  };
}
