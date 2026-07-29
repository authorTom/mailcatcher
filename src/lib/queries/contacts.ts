import { and, asc, desc, eq, gte, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { toFtsQuery } from '@/db/fts';
import { contactTags, contacts, forms, submissions, tags } from '@/db/schema';
import { SPAM_SENTINEL_EMAIL } from '@/lib/constants';

export type ContactFilters = {
  search?: string;
  tagIds?: string[];
  formIds?: string[];
  status?: 'subscribed' | 'unsubscribed';
  from?: string;
  to?: string;
  sort?: 'recent' | 'oldest' | 'submissions' | 'email';
};

export type ContactRow = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  status: 'subscribed' | 'unsubscribed';
  submissionCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  firstFormName: string | null;
  tags: { id: string; name: string; color: string }[];
};

export const PAGE_SIZE = 50;

/**
 * Build the shared WHERE clause.
 *
 * Search runs through the FTS5 index rather than LIKE, which keeps it fast on a
 * large list and gives prefix matching as you type.
 */
function buildWhere(filters: ContactFilters): SQL {
  const clauses: (SQL | undefined)[] = [ne(contacts.email, SPAM_SENTINEL_EMAIL)];

  if (filters.search?.trim()) {
    const match = toFtsQuery(filters.search);
    if (match) {
      clauses.push(
        sql`${contacts.id} IN (
          SELECT c.id FROM contacts_fts f
          JOIN contacts c ON c.rowid = f.rowid
          WHERE contacts_fts MATCH ${match}
        )`,
      );
    } else {
      // A search of only punctuation matches nothing, rather than everything.
      clauses.push(sql`1 = 0`);
    }
  }

  if (filters.status) clauses.push(eq(contacts.status, filters.status));

  if (filters.tagIds?.length) {
    // Contacts carrying ANY of the selected tags.
    clauses.push(
      sql`${contacts.id} IN (
        SELECT ${contactTags.contactId} FROM ${contactTags}
        WHERE ${inArray(contactTags.tagId, filters.tagIds)}
      )`,
    );
  }

  if (filters.formIds?.length) {
    // Contacts who submitted through ANY of the selected forms — not just the
    // form that first captured them.
    clauses.push(
      sql`${contacts.id} IN (
        SELECT ${submissions.contactId} FROM ${submissions}
        WHERE ${inArray(submissions.formId, filters.formIds)} AND ${submissions.isSpam} = 0
      )`,
    );
  }

  if (filters.from) {
    const fromMs = Date.parse(`${filters.from}T00:00:00Z`);
    if (Number.isFinite(fromMs)) clauses.push(gte(contacts.lastSeenAt, new Date(fromMs)));
  }
  if (filters.to) {
    const toMs = Date.parse(`${filters.to}T23:59:59Z`);
    if (Number.isFinite(toMs)) clauses.push(lte(contacts.lastSeenAt, new Date(toMs)));
  }

  return and(...clauses.filter(Boolean)) as SQL;
}

function orderFor(sort: ContactFilters['sort']) {
  switch (sort) {
    case 'oldest':
      return [asc(contacts.lastSeenAt), asc(contacts.id)];
    case 'submissions':
      return [desc(contacts.submissionCount), desc(contacts.lastSeenAt)];
    case 'email':
      return [asc(contacts.email)];
    default:
      return [desc(contacts.lastSeenAt), desc(contacts.id)];
  }
}

export function countContacts(filters: ContactFilters): number {
  return db.select({ n: sql<number>`count(*)` }).from(contacts).where(buildWhere(filters)).get()?.n ?? 0;
}

export function listContacts(filters: ContactFilters, page = 1): ContactRow[] {
  const rows = db
    .select({
      id: contacts.id,
      email: contacts.email,
      name: contacts.name,
      company: contacts.company,
      status: contacts.status,
      submissionCount: contacts.submissionCount,
      firstSeenAt: contacts.firstSeenAt,
      lastSeenAt: contacts.lastSeenAt,
      firstFormName: forms.name,
    })
    .from(contacts)
    .leftJoin(forms, eq(forms.id, contacts.firstFormId))
    .where(buildWhere(filters))
    .orderBy(...orderFor(filters.sort))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)
    .all();

  return attachTags(rows);
}

/** One extra query for tags rather than N — the table renders 50 rows at a time. */
function attachTags<T extends { id: string }>(rows: T[]): (T & { tags: ContactRow['tags'] })[] {
  if (rows.length === 0) return [];

  const tagRows = db
    .select({
      contactId: contactTags.contactId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(
      inArray(
        contactTags.contactId,
        rows.map((r) => r.id),
      ),
    )
    .all();

  const byContact = new Map<string, ContactRow['tags']>();
  for (const row of tagRows) {
    const list = byContact.get(row.contactId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    byContact.set(row.contactId, list);
  }

  return rows.map((row) => ({ ...row, tags: byContact.get(row.id) ?? [] }));
}

/** Every matching id, for "select all" and filtered exports. */
export function allMatchingIds(filters: ContactFilters): string[] {
  return db
    .select({ id: contacts.id })
    .from(contacts)
    .where(buildWhere(filters))
    .all()
    .map((r) => r.id);
}

export type ContactDetail = {
  contact: typeof contacts.$inferSelect;
  tags: ContactRow['tags'];
  submissions: {
    id: string;
    formId: string;
    formName: string;
    payload: Record<string, string>;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrer: string | null;
    landingPageUrl: string | null;
    country: string | null;
    createdAt: Date;
  }[];
};

export function getContactDetail(id: string): ContactDetail | null {
  const contact = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!contact || contact.email === SPAM_SENTINEL_EMAIL) return null;

  const tagRows = db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(eq(contactTags.contactId, id))
    .all();

  const submissionRows = db
    .select({
      id: submissions.id,
      formId: submissions.formId,
      formName: forms.name,
      payload: submissions.payload,
      utmSource: submissions.utmSource,
      utmMedium: submissions.utmMedium,
      utmCampaign: submissions.utmCampaign,
      referrer: submissions.referrer,
      landingPageUrl: submissions.landingPageUrl,
      country: submissions.country,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(and(eq(submissions.contactId, id), eq(submissions.isSpam, false)))
    .orderBy(desc(submissions.createdAt))
    .all();

  return { contact, tags: tagRows, submissions: submissionRows };
}

export function listAllTags() {
  // A left join + group by rather than a correlated subquery: drizzle renders
  // column references unqualified inside sql`` templates, which makes correlated
  // subqueries bind to the wrong table whenever a column name is shared.
  return db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      count: sql<number>`count(${contactTags.contactId})`,
    })
    .from(tags)
    .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.name))
    .all();
}
