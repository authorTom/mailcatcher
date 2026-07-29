import { Users } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { db } from '@/db';
import { segments } from '@/db/schema';
import { listForms } from '@/lib/forms';
import {
  PAGE_SIZE,
  countContacts,
  getContactDetail,
  listAllTags,
  listContacts,
  type ContactFilters,
} from '@/lib/queries/contacts';
import { ContactsView } from './contacts-view';

export const metadata: Metadata = { title: 'Contacts' };
export const dynamic = 'force-dynamic';

type SearchParams = {
  q?: string;
  tag?: string | string[];
  form?: string | string[];
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: string;
  contact?: string;
};

/** Query strings carry repeated keys (?tag=a&tag=b) — normalise to an array. */
function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const filters: ContactFilters = {
    search: params.q,
    tagIds: toArray(params.tag),
    formIds: toArray(params.form),
    status: params.status === 'subscribed' || params.status === 'unsubscribed' ? params.status : undefined,
    from: params.from,
    to: params.to,
    sort: (['recent', 'oldest', 'submissions', 'email'] as const).includes(params.sort as never)
      ? (params.sort as ContactFilters['sort'])
      : 'recent',
  };

  const page = Math.max(1, Number(params.page) || 1);

  const total = countContacts(filters);
  const rows = listContacts(filters, page);
  const allTags = listAllTags();
  const allForms = listForms().map((f) => ({ id: f.id, name: f.name }));
  const savedSegments = db.select().from(segments).orderBy(segments.createdAt).all();

  // The drawer is driven by ?contact=, so a contact link is shareable and the
  // browser back button closes it.
  const detail = params.contact ? getContactDetail(params.contact) : null;

  const hasAnyContacts = total > 0 || Boolean(params.q) || (filters.tagIds?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Contacts"
        description={
          total === 0 ? 'No contacts match.' : `${total.toLocaleString('en-GB')} contact${total === 1 ? '' : 's'}.`
        }
      />

      {!hasAnyContacts ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Once a landing page sends its first submission, the person behind it will appear here."
          />
        </Card>
      ) : (
        <ContactsView
          rows={rows}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          allTags={allTags}
          allForms={allForms}
          segments={savedSegments}
          detail={detail}
        />
      )}
    </>
  );
}
