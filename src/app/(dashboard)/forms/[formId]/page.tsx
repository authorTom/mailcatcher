import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/db';
import { contacts, formStats, forms, submissions } from '@/db/schema';
import { getForm } from '@/lib/forms';
import { publicOrigin } from '@/lib/origin';
import { FormDetail } from './form-detail';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ formId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { formId } = await params;
  return { title: getForm(formId)?.name ?? 'Form' };
}

export default async function FormDetailPage({ params }: Props) {
  const { formId } = await params;
  const form = getForm(formId);
  if (!form) notFound();

  // The setup snippets must show the URL a visitor's browser can reach.
  const origin = publicOrigin(await headers());

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const totals = db
    .select({
      submissions: sql<number>`count(*)`,
      contacts: sql<number>`count(distinct ${submissions.contactId})`,
    })
    .from(submissions)
    .where(and(eq(submissions.formId, form.id), eq(submissions.isSpam, false)))
    .get();

  const spamCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(submissions)
      .where(and(eq(submissions.formId, form.id), eq(submissions.isSpam, true)))
      .get()?.n ?? 0;

  const viewTotal =
    db
      .select({ n: sql<number>`coalesce(sum(${formStats.views}), 0)` })
      .from(formStats)
      .where(eq(formStats.formId, form.id))
      .get()?.n ?? 0;

  const recent = db
    .select({
      id: submissions.id,
      contactId: contacts.id,
      email: contacts.email,
      name: contacts.name,
      payload: submissions.payload,
      utmSource: submissions.utmSource,
      utmCampaign: submissions.utmCampaign,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .innerJoin(contacts, eq(contacts.id, submissions.contactId))
    .where(and(eq(submissions.formId, form.id), eq(submissions.isSpam, false)))
    .orderBy(desc(submissions.createdAt))
    .limit(25)
    .all();

  const daily = db
    .select({ day: formStats.day, views: formStats.views, submits: formStats.submits, spam: formStats.spam })
    .from(formStats)
    .where(and(eq(formStats.formId, form.id), gte(formStats.day, thirtyDaysAgo.toISOString().slice(0, 10))))
    .orderBy(formStats.day)
    .all();

  return (
    <>
      <Link
        href="/forms"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-default"
      >
        <ArrowLeft className="size-4" />
        All forms
      </Link>

      <FormDetail
        form={form}
        origin={origin}
        stats={{
          submissions: totals?.submissions ?? 0,
          contacts: totals?.contacts ?? 0,
          spam: spamCount,
          views: viewTotal,
        }}
        recent={recent}
        daily={daily}
      />
    </>
  );
}
