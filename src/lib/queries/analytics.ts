import { and, desc, eq, gte, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { contacts, formStats, forms, submissions } from '@/db/schema';
import { SPAM_SENTINEL_EMAIL, rangeStart, type RangeValue } from '@/lib/constants';

/** Excludes the spam sentinel from every contact-facing count. */
const realContact = ne(contacts.email, SPAM_SENTINEL_EMAIL);

export type Kpis = {
  totalContacts: number;
  submissions: number;
  newContacts: number;
  spamBlocked: number;
  conversionRate: number | null;
  /** Percentage change against the immediately preceding window; null for all-time. */
  submissionsChange: number | null;
  contactsChange: number | null;
};

export function getKpis(range: RangeValue): Kpis {
  const start = rangeStart(range);
  const startMs = start?.getTime() ?? 0;
  const windowMs = start ? Date.now() - startMs : 0;
  const prevStartMs = startMs - windowMs;

  const totalContacts =
    db.select({ n: sql<number>`count(*)` }).from(contacts).where(realContact).get()?.n ?? 0;

  const subs =
    db
      .select({ n: sql<number>`count(*)` })
      .from(submissions)
      .where(and(eq(submissions.isSpam, false), gte(submissions.createdAt, new Date(startMs))))
      .get()?.n ?? 0;

  const spamBlocked =
    db
      .select({ n: sql<number>`count(*)` })
      .from(submissions)
      .where(and(eq(submissions.isSpam, true), gte(submissions.createdAt, new Date(startMs))))
      .get()?.n ?? 0;

  const newContacts =
    db
      .select({ n: sql<number>`count(*)` })
      .from(contacts)
      .where(and(realContact, gte(contacts.firstSeenAt, new Date(startMs))))
      .get()?.n ?? 0;

  // Views come from the rollup, so conversion never scans the submissions table.
  const viewRow = db
    .select({ views: sql<number>`coalesce(sum(${formStats.views}), 0)` })
    .from(formStats)
    .where(start ? gte(formStats.day, start.toISOString().slice(0, 10)) : sql`1=1`)
    .get();

  const views = viewRow?.views ?? 0;
  const conversionRate = views > 0 ? (subs / views) * 100 : null;

  let submissionsChange: number | null = null;
  let contactsChange: number | null = null;

  if (start) {
    const prevSubs =
      db
        .select({ n: sql<number>`count(*)` })
        .from(submissions)
        .where(
          and(
            eq(submissions.isSpam, false),
            gte(submissions.createdAt, new Date(prevStartMs)),
            sql`${submissions.createdAt} < ${startMs}`,
          ),
        )
        .get()?.n ?? 0;

    const prevContacts =
      db
        .select({ n: sql<number>`count(*)` })
        .from(contacts)
        .where(
          and(realContact, gte(contacts.firstSeenAt, new Date(prevStartMs)), sql`${contacts.firstSeenAt} < ${startMs}`),
        )
        .get()?.n ?? 0;

    submissionsChange = percentChange(prevSubs, subs);
    contactsChange = percentChange(prevContacts, newContacts);
  }

  return { totalContacts, submissions: subs, newContacts, spamBlocked, conversionRate, submissionsChange, contactsChange };
}

function percentChange(before: number, after: number): number | null {
  if (before === 0) return after === 0 ? 0 : null;
  return ((after - before) / before) * 100;
}

export type TimePoint = { day: string; submissions: number; contacts: number };

/**
 * Daily submissions and new contacts, gap-filled so the x-axis is continuous —
 * a missing day must read as zero, not as a gap the line hops over.
 */
export function getTimeSeries(range: RangeValue): TimePoint[] {
  const start = rangeStart(range);
  const startMs = start?.getTime() ?? getEarliestMs();

  const subsRows = db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${submissions.createdAt} / 1000, 'unixepoch')`,
      n: sql<number>`count(*)`,
    })
    .from(submissions)
    .where(and(eq(submissions.isSpam, false), gte(submissions.createdAt, new Date(startMs))))
    .groupBy(sql`1`)
    .all();

  const contactRows = db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${contacts.firstSeenAt} / 1000, 'unixepoch')`,
      n: sql<number>`count(*)`,
    })
    .from(contacts)
    .where(and(realContact, gte(contacts.firstSeenAt, new Date(startMs))))
    .groupBy(sql`1`)
    .all();

  const subsByDay = new Map(subsRows.map((r) => [r.day, r.n]));
  const contactsByDay = new Map(contactRows.map((r) => [r.day, r.n]));

  const points: TimePoint[] = [];
  const cursor = new Date(startMs);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    points.push({ day, submissions: subsByDay.get(day) ?? 0, contacts: contactsByDay.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

function getEarliestMs(): number {
  const row = db.select({ ms: sql<number>`min(${submissions.createdAt})` }).from(submissions).get();
  return row?.ms ?? Date.now();
}

export type FormBreakdown = {
  id: string;
  name: string;
  submissions: number;
  views: number;
  conversionRate: number | null;
};

export function getFormBreakdown(range: RangeValue): FormBreakdown[] {
  const start = rangeStart(range);
  const startMs = start?.getTime() ?? 0;
  const startDay = start?.toISOString().slice(0, 10) ?? '0000-01-01';

  // Two grouped queries merged in memory, rather than correlated subqueries.
  // Drizzle renders column references unqualified inside sql`` templates, so a
  // correlated subquery would silently bind to the inner table's column of the
  // same name instead of the outer one.
  const formRows = db
    .select({ id: forms.id, name: forms.name })
    .from(forms)
    .where(ne(forms.status, 'archived'))
    .all();

  const submissionCounts = db
    .select({ formId: submissions.formId, n: sql<number>`count(*)` })
    .from(submissions)
    .where(and(eq(submissions.isSpam, false), gte(submissions.createdAt, new Date(startMs))))
    .groupBy(submissions.formId)
    .all();

  const viewCounts = db
    .select({ formId: formStats.formId, n: sql<number>`coalesce(sum(${formStats.views}), 0)` })
    .from(formStats)
    .where(gte(formStats.day, startDay))
    .groupBy(formStats.formId)
    .all();

  const submissionsByForm = new Map(submissionCounts.map((r) => [r.formId, r.n]));
  const viewsByForm = new Map(viewCounts.map((r) => [r.formId, r.n]));

  return formRows
    .map((form) => {
      const subs = submissionsByForm.get(form.id) ?? 0;
      const views = viewsByForm.get(form.id) ?? 0;
      return {
        ...form,
        submissions: subs,
        views,
        conversionRate: views > 0 ? (subs / views) * 100 : null,
      };
    })
    .sort((a, b) => b.submissions - a.submissions);
}

export type SourceBreakdown = { source: string; submissions: number };

export function getTopSources(range: RangeValue, limit = 6): SourceBreakdown[] {
  const startMs = rangeStart(range)?.getTime() ?? 0;

  return db
    .select({
      source: sql<string>`coalesce(nullif(${submissions.utmSource}, ''), 'Direct')`,
      submissions: sql<number>`count(*)`,
    })
    .from(submissions)
    .where(and(eq(submissions.isSpam, false), gte(submissions.createdAt, new Date(startMs))))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`)
    .limit(limit)
    .all();
}

export type CampaignBreakdown = { campaign: string; source: string; submissions: number };

export function getTopCampaigns(range: RangeValue, limit = 6): CampaignBreakdown[] {
  const startMs = rangeStart(range)?.getTime() ?? 0;

  return db
    .select({
      campaign: sql<string>`${submissions.utmCampaign}`,
      source: sql<string>`coalesce(nullif(${submissions.utmSource}, ''), 'Direct')`,
      submissions: sql<number>`count(*)`,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.isSpam, false),
        gte(submissions.createdAt, new Date(startMs)),
        sql`${submissions.utmCampaign} is not null and ${submissions.utmCampaign} != ''`,
      ),
    )
    .groupBy(sql`1, 2`)
    .orderBy(sql`3 desc`)
    .limit(limit)
    .all();
}

export type RecentSubmission = {
  id: string;
  email: string;
  name: string | null;
  contactId: string;
  formName: string;
  source: string | null;
  createdAt: Date;
};

export function getRecentSubmissions(limit = 8): RecentSubmission[] {
  return db
    .select({
      id: submissions.id,
      email: contacts.email,
      name: contacts.name,
      contactId: contacts.id,
      formName: forms.name,
      source: submissions.utmSource,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .innerJoin(contacts, eq(contacts.id, submissions.contactId))
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.isSpam, false))
    .orderBy(desc(submissions.createdAt))
    .limit(limit)
    .all();
}
